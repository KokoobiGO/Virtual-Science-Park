/**
 * Health check for the data sources (A19): one plain verdict per row of
 * source_status. The verdict is a pure rule over the rows; sourceHealth()
 * only reads them. It uses getDb(), so jobs and scripts only.
 *
 * - ok: live, and the last success is at most 48 hours old.
 * - stale: live, but the last success is older than that, or there never was one.
 * - cached: a recorded copy is in use (with the date of the copy and why).
 * - hand_entered: the source is simulated (entered by hand).
 */
import { getDb } from "../db";
import { sourceStatus } from "../db/schema";

/** A live source with no success for longer than this is "stale". */
export const STALE_SOURCE_HOURS = 48;

export type SourceVerdict = "ok" | "stale" | "cached" | "hand_entered";

export type SourceStatusRow = Pick<
  typeof sourceStatus.$inferSelect,
  "source" | "label" | "state" | "lastSuccessAt" | "cachedAt" | "itemCount" | "message"
>;

export type SourceHealth = SourceStatusRow & { verdict: SourceVerdict };

export function sourceVerdict(row: Pick<SourceStatusRow, "state" | "lastSuccessAt">, now: Date = new Date()): SourceVerdict {
  if (row.state === "cached") return "cached";
  if (row.state === "simulated") return "hand_entered";
  const fresh = row.lastSuccessAt && now.getTime() - row.lastSuccessAt.getTime() <= STALE_SOURCE_HOURS * 3_600_000;
  return fresh ? "ok" : "stale";
}

/** One entry per row, in source order. */
export function judgeSources(rows: SourceStatusRow[], now: Date = new Date()): SourceHealth[] {
  return [...rows]
    .sort((a, b) => a.source.localeCompare(b.source))
    .map((row) => ({ ...row, verdict: sourceVerdict(row, now) }));
}

export async function sourceHealth(now: Date = new Date()): Promise<SourceHealth[]> {
  const rows = await getDb()
    .select({
      source: sourceStatus.source,
      label: sourceStatus.label,
      state: sourceStatus.state,
      lastSuccessAt: sourceStatus.lastSuccessAt,
      cachedAt: sourceStatus.cachedAt,
      itemCount: sourceStatus.itemCount,
      message: sourceStatus.message,
    })
    .from(sourceStatus);
  return judgeSources(rows, now);
}
