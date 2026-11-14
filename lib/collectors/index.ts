/**
 * Every collector the app knows, by source key. Add a new collector here; the
 * collect job and `npm run collect` find it by its key.
 */
import type { Collector } from "./types";

export const COLLECTORS: Collector[] = [];

export function getCollector(source: string): Collector {
  const collector = COLLECTORS.find((c) => c.source === source);
  if (!collector) throw new Error(`Unknown source "${source}". Known: ${COLLECTORS.map((c) => c.source).join(", ") || "none"}.`);
  return collector;
}
