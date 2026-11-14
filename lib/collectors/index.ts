/**
 * Every collector the app knows, by source key. Add a new collector here; the
 * collect job and `npm run collect` find it by its key.
 */
import { bspNewsCollector } from "./bsp-news";
import { energimyndighetenCollector } from "./energimyndigheten";
import { euFundingCollector } from "./eu-funding";
import { regionalCollector } from "./regional";
import { seriesEventsCollector } from "./series-events";
import { tclEventsCollector } from "./tcl-events";
import { testbedsCollector } from "./testbeds";
import type { Collector } from "./types";
import { vinnovaCollector } from "./vinnova";

export const COLLECTORS: Collector[] = [
  vinnovaCollector,
  energimyndighetenCollector,
  euFundingCollector,
  regionalCollector,
  testbedsCollector,
  tclEventsCollector,
  seriesEventsCollector,
  bspNewsCollector,
];

export function getCollector(source: string): Collector {
  const collector = COLLECTORS.find((c) => c.source === source);
  if (!collector) throw new Error(`Unknown source "${source}". Known: ${COLLECTORS.map((c) => c.source).join(", ") || "none"}.`);
  return collector;
}
