/**
 * Fetches one page and stores it as a snapshot (A1).
 *
 *   await inngest.send({ name: "app/snapshot.requested", data: { url, source, companyId } })
 *
 * Jobs that already run inside Inngest (member import, profiler) can call
 * fetchSnapshot() from lib/snapshots.ts in their own step instead.
 */
import { NonRetriableError } from "inngest";
import { z } from "zod";
import { FetchPageError } from "@/lib/fetcher/fetch-page";
import { fetchSnapshot } from "@/lib/snapshots";
import { inngest } from "../client";

export const SnapshotRequest = z.object({
  url: z.string().min(1),
  source: z.string().min(1).default("manual"),
  companyId: z.uuid().nullish(),
});

export type SnapshotResult = {
  snapshotId: string;
  url: string;
  title: string | null;
  lang: string | null;
  chars: number;
  method: string;
  retrievedAt: string;
  /** True when the page text was the same as the stored snapshot. */
  unchanged: boolean;
  preview: string;
};

export const fetchSnapshotJob = inngest.createFunction(
  { id: "fetch-snapshot", name: "Fetch a page into a snapshot", retries: 2, triggers: [{ event: "app/snapshot.requested" }] },
  async ({ event, step }): Promise<SnapshotResult> => {
    const request = SnapshotRequest.safeParse(event.data);
    if (!request.success) throw new NonRetriableError(`Bad event data: ${request.error.message}`);

    return step.run("fetch and store", async () => {
      try {
        const { snapshot, unchanged, method } = await fetchSnapshot(request.data);
        return {
          snapshotId: snapshot.id,
          url: snapshot.url,
          title: snapshot.title,
          lang: snapshot.lang,
          chars: snapshot.contentText.length,
          method,
          retrievedAt: snapshot.retrievedAt.toISOString(),
          unchanged,
          preview: snapshot.contentText.slice(0, 600),
        };
      } catch (error) {
        // A bad URL, a 404 or a PDF stays the same on a second try.
        if (error instanceof FetchPageError && error.permanent) throw new NonRetriableError(error.message);
        throw error;
      }
    });
  },
);
