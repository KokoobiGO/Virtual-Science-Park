/**
 * Collect opportunities from the outside sources (A9 to A13, A25, A26).
 *
 *   await inngest.send({ name: "app/sources.collect.requested", data: {} })
 *   await inngest.send({ name: "app/sources.collect.requested", data: { sources: ["vinnova"] } })
 *
 * Each source is its own step, so one slow or broken source never stops the
 * others and no step comes near Netlify's 30 s limit. A collector that cannot
 * reach its source falls back to its recorded copy and says so (state "cached").
 */
import { NonRetriableError } from "inngest";
import { z } from "zod";
import { COLLECTORS } from "@/lib/collectors";
import { storeCollected, type StoredCollection } from "@/lib/collectors/store";
import { getDb } from "@/lib/db";
import { jobRuns } from "@/lib/db/schema";
import { inngest } from "../client";

const CollectRequest = z.object({ sources: z.array(z.string()).optional() });

export type CollectSourcesResult = { stored: StoredCollection[]; failed: { source: string; error: string }[] };

export const collectSourcesJob = inngest.createFunction(
  { id: "collect-sources", name: "Collect opportunities from the sources", retries: 1, triggers: [{ event: "app/sources.collect.requested" }] },
  async ({ event, step }): Promise<CollectSourcesResult> => {
    const request = CollectRequest.safeParse(event.data ?? {});
    if (!request.success) throw new NonRetriableError(`Bad event data: ${request.error.message}`);
    const wanted = request.data.sources;
    const unknown = (wanted ?? []).filter((s) => !COLLECTORS.some((c) => c.source === s));
    if (unknown.length) throw new NonRetriableError(`Unknown sources: ${unknown.join(", ")}`);

    const result: CollectSourcesResult = { stored: [], failed: [] };
    for (const collector of COLLECTORS.filter((c) => !wanted || wanted.includes(c.source))) {
      // A failing source is recorded, not thrown: the other sources still run.
      const outcome = await step.run(`collect ${collector.source}`, async () => {
        try {
          return { ok: true as const, stored: await storeCollected(collector, await collector.collect()) };
        } catch (error) {
          return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
        }
      });
      if (outcome.ok) result.stored.push(outcome.stored);
      else result.failed.push({ source: collector.source, error: outcome.error });
    }

    await step.run("record run", async () => {
      const ok = result.failed.length === 0;
      await getDb()
        .insert(jobRuns)
        .values({
          job: "collect-sources",
          trigger: event.name,
          status: ok ? "succeeded" : "failed",
          // The function body runs again for every step, so the event's time is the stable start.
          startedAt: new Date(event.ts ?? Date.now()),
          finishedAt: new Date(),
          stats: result,
          error: ok ? null : `${result.failed.length} sources failed`,
        });
    });

    return result;
  },
);
