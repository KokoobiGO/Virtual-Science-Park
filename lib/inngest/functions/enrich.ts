/**
 * Tag and embed opportunities and companies (A14).
 *
 *   await inngest.send({ name: "app/enrich.requested", data: {} })
 *   await inngest.send({ name: "app/enrich.requested", data: { force: true } })
 *
 * It also runs every night at 03:30 Swedish time, after the collectors (03:00).
 *
 * Without `force` only rows without an embedding are done, so running it again
 * picks up where the last run stopped (and after a collector changed a text).
 * `limit` caps the opportunities and the companies, for a test.
 *
 * One step per ten opportunities and per ten companies: one tagger call and
 * one Voyage call each, well under Netlify's 30 s. A rate limit (429) fails
 * the step and Inngest tries it again a minute later; the Voyage key without
 * billing allows 3 requests and 10,000 tokens a minute.
 */
import { NonRetriableError, RetryAfterError } from "inngest";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { jobRuns } from "@/lib/db/schema";
import {
  addResults,
  emptyEnrichResult,
  enrichCompanies,
  enrichOpportunities,
  ENRICH_CHUNK,
  listPending,
  type EnrichResult,
} from "@/lib/embeddings/enrich";
import { NvidiaApiError } from "@/lib/nvidia";
import { VoyageApiError } from "@/lib/voyage";
import { inngest } from "../client";

const EnrichRequest = z.object({
  force: z.boolean().default(false),
  limit: z.number().int().positive().optional(),
});

export type EnrichJobResult = { opportunities: EnrichResult; companies: EnrichResult };

const chunks = (ids: string[]) => Array.from({ length: Math.ceil(ids.length / ENRICH_CHUNK) }, (_, i) => ids.slice(i * ENRICH_CHUNK, (i + 1) * ENRICH_CHUNK));

/** A rate limit is not a bug: fail the step and let Inngest try it again after the limit's minute. */
async function retryLaterOn429<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if ((error instanceof VoyageApiError || error instanceof NvidiaApiError) && error.status === 429) {
      throw new RetryAfterError(error.message, "60s", { cause: error });
    }
    throw error;
  }
}

export const enrichJob = inngest.createFunction(
  {
    id: "enrich",
    name: "Tag and embed opportunities and companies",
    retries: 3,
    // One step at a time across runs: the Voyage key's limit is per minute.
    concurrency: { limit: 1 },
    triggers: [{ cron: "TZ=Europe/Stockholm 30 3 * * *" }, { event: "app/enrich.requested" }],
  },
  async ({ event, step }): Promise<EnrichJobResult> => {
    const request = EnrichRequest.safeParse(event.data ?? {});
    if (!request.success) throw new NonRetriableError(`Bad event data: ${request.error.message}`);
    const { force, limit } = request.data;

    const pending = await step.run("list pending", () => listPending({ force, limit }));

    const result: EnrichJobResult = { opportunities: emptyEnrichResult(), companies: emptyEnrichResult() };
    for (const [i, ids] of chunks(pending.opportunityIds).entries()) {
      const part = await step.run(`opportunities ${i * ENRICH_CHUNK + 1}-${i * ENRICH_CHUNK + ids.length}`, () =>
        retryLaterOn429(() => enrichOpportunities(ids, { force })),
      );
      addResults(result.opportunities, part);
    }
    for (const [i, ids] of chunks(pending.companyIds).entries()) {
      const part = await step.run(`companies ${i * ENRICH_CHUNK + 1}-${i * ENRICH_CHUNK + ids.length}`, () =>
        retryLaterOn429(() => enrichCompanies(ids)),
      );
      addResults(result.companies, part);
    }

    await step.run("record run", async () => {
      await getDb()
        .insert(jobRuns)
        .values({
          job: "enrich",
          trigger: event.name,
          status: "succeeded",
          // The function body runs again for every step, so the event's time is the stable start.
          startedAt: new Date(event.ts ?? Date.now()),
          finishedAt: new Date(),
          inputTokens: result.opportunities.tagger.inputTokens + result.companies.tagger.inputTokens,
          outputTokens: result.opportunities.tagger.outputTokens + result.companies.tagger.outputTokens,
          stats: { force, limit: limit ?? null, ...result },
        });
    });

    return result;
  },
);
