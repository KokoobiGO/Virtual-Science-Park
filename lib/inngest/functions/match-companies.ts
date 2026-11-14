/**
 * Rank the opportunities for the companies and store the top 20 per mode
 * (A15, A18). SQL only: no model calls.
 *
 *   await inngest.send({ name: "app/match.requested", data: {} })                       every company with a public embedding
 *   await inngest.send({ name: "app/match.requested", data: { slugs: ["embeddedart"] } })
 *   await inngest.send({ name: "app/company.profile.changed", data: { companyId } })     after a profile edit
 *
 * It also runs every night at 04:30 Swedish time, after the collectors (03:00)
 * and the enrichment (03:30), so new opportunities are ranked the same night.
 *
 * One step per ten companies (about 0.3 s each, both modes); a company that
 * fails is recorded and the others still run.
 *
 * The chain after a profile change (C8), one job per hop so every step stays
 * well under Netlify's 30 s:
 *
 *   app/company.profile.changed  ->  this job: did a claim change since the last embedding?
 *     yes: app/company.embed.requested  ->  enrich job: one Voyage call  ->  app/match.requested { afterProfileChange }  ->  this job
 *     no (a priority switch): rank now, in about a second
 *   ranked  ->  app/company.judge.requested { cards: true }  ->  judge-company: the newly ranked rows  ->  app/cards.requested
 *           or, with nothing to judge, app/cards.requested straight away  ->  build-week-cards
 *
 * After a profile change the follow-up always runs, so the cards are built
 * again even when the order did not move. Otherwise (the nightly run, the
 * enrich job, feedback on a card) it runs for the companies whose stored top
 * 20 changed in either mode.
 */
import { NonRetriableError } from "inngest";
import { z } from "zod";
import { followUpEvents, planFollowUp, type FollowUp } from "@/lib/cards/follow-up";
import { getDb } from "@/lib/db";
import { jobRuns } from "@/lib/db/schema";
import { embeddingAge, needsNewEmbedding } from "@/lib/embeddings/stale";
import { companiesToJudge } from "@/lib/judge/store";
import {
  companiesToMatch,
  rankAndStore,
  rankingChanged,
  UnknownCompanyError,
  type CompanyToMatch,
  type RankAndStoreResult,
} from "@/lib/matcher/store";
import { MatchMode } from "@/lib/schemas";
import { inngest } from "../client";

const MATCH_CHUNK = 10;

const MatchRequest = z.object({
  slugs: z.array(z.string().min(1)).optional(),
  /** Set by the enrich job after it built a changed profile's embedding: judge and build the cards whatever moved. */
  afterProfileChange: z.boolean().default(false),
});
const ProfileChanged = z.object({ companyId: z.uuid() });

export type MatchCompaniesResult = {
  companies: number;
  /** Rows stored with a rank, per mode. */
  ranked: { personal: number; public: number };
  /** Older rows that lost their rank. */
  unranked: number;
  /** Total time spent ranking and storing. */
  ms: number;
  /** Modes left alone because the company has no embedding for them; their stored matches are untouched. */
  skipped: { slug: string; mode: MatchMode; reason: string }[];
  failed: { slug: string; error: string }[];
  /** Companies whose stored top 20 changed in either mode. */
  changed: string[];
  /** A claim changed since the last embedding: the enrich job builds it first and asks for this ranking again. Nothing was ranked. */
  embeddingRequested: boolean;
  /** What was sent after the ranking: judge runs (they build the cards when done) and one cards build for the rest. */
  followUp: FollowUp;
};

const chunks = <T>(items: T[]) =>
  Array.from({ length: Math.ceil(items.length / MATCH_CHUNK) }, (_, i) => items.slice(i * MATCH_CHUNK, (i + 1) * MATCH_CHUNK));

export const matchCompaniesJob = inngest.createFunction(
  {
    id: "match-companies",
    name: "Rank opportunities for the companies",
    retries: 2,
    triggers: [
      { cron: "TZ=Europe/Stockholm 30 4 * * *" },
      { event: "app/match.requested" },
      { event: "app/company.profile.changed" },
    ],
  },
  async ({ event, step }): Promise<MatchCompaniesResult> => {
    const trigger = event.name === "inngest/scheduled.timer" ? "cron" : event.name;
    // A cron run's data holds only the schedule: every company is ranked.
    let filter: { slugs?: string[]; companyId?: string } = {};
    let afterProfileChange = false;
    if (event.name === "app/company.profile.changed") {
      const changed = ProfileChanged.safeParse(event.data ?? {});
      if (!changed.success) throw new NonRetriableError(`Bad event data: ${changed.error.message}`);
      filter = { companyId: changed.data.companyId };
      afterProfileChange = true;
    } else if (event.name === "app/match.requested") {
      const request = MatchRequest.safeParse(event.data ?? {});
      if (!request.success) throw new NonRetriableError(`Bad event data: ${request.error.message}`);
      filter = { slugs: request.data.slugs };
      afterProfileChange = request.data.afterProfileChange;
    }

    const targets = await step.run("list companies", async (): Promise<CompanyToMatch[]> => {
      try {
        return await companiesToMatch(filter);
      } catch (error) {
        if (error instanceof UnknownCompanyError) throw new NonRetriableError(error.message);
        throw error;
      }
    });

    const result: MatchCompaniesResult = {
      companies: targets.length,
      ranked: { personal: 0, public: 0 },
      unranked: 0,
      ms: 0,
      skipped: [],
      failed: [],
      changed: [],
      embeddingRequested: false,
      followUp: { judge: [], cards: [] },
    };

    // A text edit changes what the embeddings are built from: ranking now would use the old ones.
    const company = event.name === "app/company.profile.changed" ? targets[0] : undefined;
    if (company && (await step.run("check embedding", async () => needsNewEmbedding(await embeddingAge(company.id))))) {
      await step.sendEvent("request embedding", { name: "app/company.embed.requested", data: { companyId: company.id, slug: company.slug } });
      result.embeddingRequested = true;
    } else {
      const reranked: string[] = [];
      for (const [i, part] of chunks(targets).entries()) {
        const outcomes = await step.run(`rank ${i * MATCH_CHUNK + 1}-${i * MATCH_CHUNK + part.length}`, async () => {
          const done: ({ ok: true; slug: string; stored: RankAndStoreResult } | { ok: false; slug: string; error: string })[] = [];
          // A failing company is recorded, not thrown: the others in the step still run.
          for (const target of part) {
            try {
              done.push({ ok: true, slug: target.slug, stored: await rankAndStore(target.id) });
            } catch (error) {
              done.push({ ok: false, slug: target.slug, error: error instanceof Error ? error.message : String(error) });
            }
          }
          return done;
        });
        for (const outcome of outcomes) {
          if (!outcome.ok) {
            result.failed.push({ slug: outcome.slug, error: outcome.error });
            continue;
          }
          let rankedAny = false;
          for (const mode of MatchMode.options) {
            const stored = outcome.stored[mode];
            if ("skipped" in stored) {
              result.skipped.push({ slug: outcome.slug, mode, reason: stored.skipped });
            } else {
              rankedAny = true;
              result.ranked[mode] += stored.ranked;
              result.unranked += stored.unranked;
            }
          }
          result.ms += outcome.stored.ms;
          if (rankingChanged(outcome.stored)) result.changed.push(outcome.slug);
          if (rankedAny) reranked.push(outcome.slug);
        }
      }

      const follow = afterProfileChange ? reranked : result.changed;
      if (follow.length) {
        result.followUp = await step.run("plan follow-up", async () =>
          planFollowUp(
            follow,
            (await companiesToJudge({ slugs: follow })).map((c) => c.slug),
          ),
        );
        const events = followUpEvents(result.followUp);
        if (events.length) await step.sendEvent("request judging and cards", events);
      }
    }

    await step.run("record run", async () => {
      const ok = result.failed.length === 0;
      await getDb()
        .insert(jobRuns)
        .values({
          job: "match-companies",
          trigger,
          status: ok ? "succeeded" : "failed",
          // The function body runs again for every step, so the event's time is the stable start.
          startedAt: new Date(event.ts ?? Date.now()),
          finishedAt: new Date(),
          stats: { filter, afterProfileChange, ...result },
          error: ok ? null : `${result.failed.length} companies failed`,
        });
    });

    return result;
  },
);
