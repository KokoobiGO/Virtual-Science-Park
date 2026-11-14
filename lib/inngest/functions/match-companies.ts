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
 * fails is recorded and the others still run. The member does not wait for
 * this job after an edit: the page calls rankCompany with the member's own
 * client and gets the new order at once.
 */
import { NonRetriableError } from "inngest";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { jobRuns } from "@/lib/db/schema";
import { companiesToMatch, rankAndStore, UnknownCompanyError, type CompanyToMatch, type RankAndStoreResult } from "@/lib/matcher/store";
import { MatchMode } from "@/lib/schemas";
import { inngest } from "../client";

const MATCH_CHUNK = 10;

const MatchRequest = z.object({ slugs: z.array(z.string().min(1)).optional() });
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
    if (event.name === "app/company.profile.changed") {
      const changed = ProfileChanged.safeParse(event.data ?? {});
      if (!changed.success) throw new NonRetriableError(`Bad event data: ${changed.error.message}`);
      filter = { companyId: changed.data.companyId };
    } else if (event.name === "app/match.requested") {
      const request = MatchRequest.safeParse(event.data ?? {});
      if (!request.success) throw new NonRetriableError(`Bad event data: ${request.error.message}`);
      filter = { slugs: request.data.slugs };
    }

    const targets = await step.run("list companies", async (): Promise<CompanyToMatch[]> => {
      try {
        return await companiesToMatch(filter);
      } catch (error) {
        if (error instanceof UnknownCompanyError) throw new NonRetriableError(error.message);
        throw error;
      }
    });

    const result: MatchCompaniesResult = { companies: targets.length, ranked: { personal: 0, public: 0 }, unranked: 0, ms: 0, skipped: [], failed: [] };
    for (const [i, part] of chunks(targets).entries()) {
      const outcomes = await step.run(`rank ${i * MATCH_CHUNK + 1}-${i * MATCH_CHUNK + part.length}`, async () => {
        const done: ({ ok: true; slug: string; stored: RankAndStoreResult } | { ok: false; slug: string; error: string })[] = [];
        // A failing company is recorded, not thrown: the others in the step still run.
        for (const company of part) {
          try {
            done.push({ ok: true, slug: company.slug, stored: await rankAndStore(company.id) });
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
        for (const mode of MatchMode.options) {
          const stored = outcome.stored[mode];
          if ("skipped" in stored) {
            result.skipped.push({ slug: outcome.slug, mode, reason: stored.skipped });
          } else {
            result.ranked[mode] += stored.ranked;
            result.unranked += stored.unranked;
          }
        }
        result.ms += outcome.stored.ms;
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
          stats: { filter, ...result },
          error: ok ? null : `${result.failed.length} companies failed`,
        });
    });

    return result;
  },
);
