/**
 * Build the "Your week" cards (A17): 5 to 7 cards per company from its judged
 * personal matches, plus one trend card when this week has a trend note for
 * one of its tags. No model call.
 *
 *   await inngest.send({ name: "app/cards.requested", data: {} })                          every company with judged personal matches
 *   await inngest.send({ name: "app/cards.requested", data: { slugs: ["embeddedart"] } })
 *
 * It also runs every Monday at 06:00 Swedish time. Building again in the same
 * week replaces that week's cards. One step per ten companies; a company that
 * fails is recorded and the others still run.
 */
import { NonRetriableError } from "inngest";
import { z } from "zod";
import { buildWeekCards, companiesForCards, UnknownCompanyError, type CompanyForCards } from "@/lib/cards/build";
import { getDb } from "@/lib/db";
import { jobRuns } from "@/lib/db/schema";
import { inngest } from "../client";

const CARDS_CHUNK = 10;

const CardsRequest = z.object({ slugs: z.array(z.string().min(1)).optional() });

export type BuildWeekCardsResult = {
  companies: number;
  weekOf: string | null;
  /** Cards stored, over all companies. */
  cards: number;
  /** Of those, trend cards. */
  trendCards: number;
  /** Companies with fewer than 5 cards: too few usable matches. */
  short: { slug: string; cards: number }[];
  failed: { slug: string; error: string }[];
};

const chunks = <T>(items: T[]) =>
  Array.from({ length: Math.ceil(items.length / CARDS_CHUNK) }, (_, i) => items.slice(i * CARDS_CHUNK, (i + 1) * CARDS_CHUNK));

export const buildWeekCardsJob = inngest.createFunction(
  {
    id: "build-week-cards",
    name: "Build the Your week cards",
    retries: 2,
    triggers: [{ cron: "TZ=Europe/Stockholm 0 6 * * 1" }, { event: "app/cards.requested" }],
  },
  async ({ event, step }): Promise<BuildWeekCardsResult> => {
    const trigger = event.name === "inngest/scheduled.timer" ? "cron" : event.name;
    // A cron run's data holds only the schedule, so no `slugs`: every company with judged matches.
    const request = CardsRequest.safeParse(event.name === "app/cards.requested" ? (event.data ?? {}) : {});
    if (!request.success) throw new NonRetriableError(`Bad event data: ${request.error.message}`);

    const targets = await step.run("list companies", async (): Promise<CompanyForCards[]> => {
      try {
        return await companiesForCards({ slugs: request.data.slugs });
      } catch (error) {
        if (error instanceof UnknownCompanyError) throw new NonRetriableError(error.message);
        throw error;
      }
    });
    // The week is fixed once, so a run that crosses midnight on Sunday stores all cards in one week.
    const now = await step.run("pick week", async () => new Date().toISOString());

    const result: BuildWeekCardsResult = { companies: targets.length, weekOf: null, cards: 0, trendCards: 0, short: [], failed: [] };
    for (const [i, part] of chunks(targets).entries()) {
      const outcomes = await step.run(`cards ${i * CARDS_CHUNK + 1}-${i * CARDS_CHUNK + part.length}`, async () => {
        const done: ({ ok: true; slug: string; weekOf: string; cards: number; trend: number } | { ok: false; slug: string; error: string })[] = [];
        for (const company of part) {
          try {
            const built = await buildWeekCards(company, { now: new Date(now) });
            done.push({ ok: true, slug: company.slug, weekOf: built.weekOf, cards: built.stored ?? 0, trend: built.cards.filter((c) => c.kind === "trend").length });
          } catch (error) {
            done.push({ ok: false, slug: company.slug, error: error instanceof Error ? error.message : String(error) });
          }
        }
        return done;
      });
      for (const outcome of outcomes) {
        if (!outcome.ok) {
          result.failed.push({ slug: outcome.slug, error: outcome.error });
          continue;
        }
        result.weekOf = outcome.weekOf;
        result.cards += outcome.cards;
        result.trendCards += outcome.trend;
        if (outcome.cards < 5) result.short.push({ slug: outcome.slug, cards: outcome.cards });
      }
    }

    await step.run("record run", async () => {
      const ok = result.failed.length === 0;
      await getDb()
        .insert(jobRuns)
        .values({
          job: "build-week-cards",
          trigger,
          status: ok ? "succeeded" : "failed",
          // The function body runs again for every step, so the event's time is the stable start.
          startedAt: new Date(event.ts ?? Date.now()),
          finishedAt: new Date(),
          stats: result,
          error: ok ? null : `${result.failed.length} companies failed`,
        });
    });

    return result;
  },
);
