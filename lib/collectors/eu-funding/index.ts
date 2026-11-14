/**
 * EU Funding & Tenders collector (A11): open and forthcoming EU grant topics
 * in the members' areas. The search API is unofficial, so when it fails the
 * recorded copy in recorded.json is used and the result is labelled "cached".
 */
import { liveOrCached, type Recorded } from "../cache";
import type { Collector } from "../types";
import { searchEuFunding, type EuSearchHit } from "./api";
import { parseEuFunding } from "./parse";
import recordedJson from "./recorded.json";

const recorded: Recorded<EuSearchHit[]> = recordedJson;

export const euFundingCollector: Collector = {
  source: "eu_funding",
  label: "EU Funding & Tenders",
  async collect() {
    const now = new Date();
    const result = await liveOrCached(async () => {
      const hits = await searchEuFunding(now);
      // There are always open EU calls: none means the API changed under us.
      if (parseEuFunding(hits, now).length === 0) throw new Error(`no open topics among ${hits.length} search hits`);
      return hits;
    }, recorded);
    return { items: parseEuFunding(result.data, now), state: result.state, cachedAt: result.cachedAt, message: result.message };
  },
};
