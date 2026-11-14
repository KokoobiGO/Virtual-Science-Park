/**
 * Find possible connections between members (A28), for BSP staff.
 *
 *   await inngest.send({ name: "app/connections.requested", data: {} })
 *   await inngest.send({ name: "app/connections.requested", data: { limit: 6 } })
 *
 * Lists the candidate pairs (each profiled member's nearest members by public
 * embedding, the 60 most similar pairs), judges two pairs per step in parallel
 * (each call stops after 26 s, so a step stays under Netlify's 30 s), and
 * stores the pairs that passed the checks. Pairs stored by an earlier run that
 * this run did not confirm are deleted. `limit` judges only the first few
 * pairs, for a test; the store step still replaces the whole table.
 *
 * A rate limit (429) from NVIDIA fails the step and Inngest tries it again a
 * minute later.
 */
import { NonRetriableError, RetryAfterError } from "inngest";
import { z } from "zod";
import { listCandidates } from "@/lib/connections/candidates";
import { connectionsToStore, judgeCandidates, PAIRS_PER_STEP, summarize, type FindSummary, type PairVerdict } from "@/lib/connections/find";
import { JUDGE_TIMEOUT_MS } from "@/lib/connections/judge";
import { storeConnections, type StoredConnections } from "@/lib/connections/store";
import { getDb } from "@/lib/db";
import { jobRuns } from "@/lib/db/schema";
import { NvidiaApiError } from "@/lib/nvidia";
import { inngest } from "../client";

const FindConnectionsRequest = z.object({
  limit: z.number().int().positive().optional(),
});

export type FindConnectionsResult = FindSummary & StoredConnections & { dropped: { pair: string; outcome: PairVerdict["outcome"]; reason: string | null }[] };

/** A rate limit is not a bug: fail the step and let Inngest try it again after the limit's minute. */
async function retryLaterOn429<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof NvidiaApiError && error.status === 429) throw new RetryAfterError(error.message, "60s", { cause: error });
    throw error;
  }
}

export const findConnectionsJob = inngest.createFunction(
  {
    id: "find-connections",
    name: "Find possible connections between members",
    retries: 2,
    // One run at a time: NVIDIA's free key is rate limited, and the store step replaces the table.
    concurrency: { limit: 1 },
    triggers: [{ event: "app/connections.requested" }],
  },
  async ({ event, step }): Promise<FindConnectionsResult> => {
    const request = FindConnectionsRequest.safeParse(event.data ?? {});
    if (!request.success) throw new NonRetriableError(`Bad event data: ${request.error.message}`);
    const { limit } = request.data;

    const candidates = await step.run("list candidates", () => listCandidates({ limit }));

    const verdicts: PairVerdict[] = [];
    for (let i = 0; i < candidates.length; i += PAIRS_PER_STEP) {
      const pairs = candidates.slice(i, i + PAIRS_PER_STEP);
      const part = await step.run(`judge pairs ${i + 1}-${i + pairs.length}`, () =>
        retryLaterOn429(() => judgeCandidates(pairs, { deadline: Date.now() + JUDGE_TIMEOUT_MS })),
      );
      verdicts.push(...part);
    }

    const summary = summarize(verdicts);
    const stored = await step.run("store connections", async () => {
      const saved = await storeConnections(connectionsToStore(verdicts));
      await getDb()
        .insert(jobRuns)
        .values({
          job: "find-connections",
          trigger: event.name,
          status: "succeeded",
          // The function body runs again for every step, so the event's time is the stable start.
          startedAt: new Date(event.ts ?? Date.now()),
          finishedAt: new Date(),
          inputTokens: summary.tokens.input,
          outputTokens: summary.tokens.output,
          stats: { limit: limit ?? null, ...summary, ...saved },
        });
      return saved;
    });

    return {
      ...summary,
      ...stored,
      dropped: verdicts
        .filter((v) => v.outcome !== "passed")
        .map((v) => ({ pair: `${v.companyAName} + ${v.companyBName}`, outcome: v.outcome, reason: v.reason })),
    };
  },
);
