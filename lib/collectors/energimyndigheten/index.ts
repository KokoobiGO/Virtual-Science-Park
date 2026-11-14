/**
 * Energimyndigheten collector (A10): the open calls on
 * https://www.energimyndigheten.se/utlysningar/ as funding opportunities.
 *
 * The endpoint is the one the page's own script posts to. Tab 0 is
 * "Aktuella" (all open calls); it pages by 30, so we follow HasMore a little.
 */
import { fetchJson, liveOrCached, type Recorded } from "../cache";
import type { Collector } from "../types";
import { LIST_URL, parseEnergimyndigheten, type EnergimyndighetenResponse } from "./parse";
import recordedJson from "./recorded.json";

const recorded = recordedJson as Recorded<EnergimyndighetenResponse>;

const CURRENT_TAB = "0";
const MAX_PAGES = 3;
const TIMEOUT_MS = 8_000;

async function fetchCalls(): Promise<EnergimyndighetenResponse> {
  const items: EnergimyndighetenResponse["Items"] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await fetchJson<EnergimyndighetenResponse>(
      LIST_URL,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", Accept: "application/json" },
        body: new URLSearchParams({ Page: String(page), Id: CURRENT_TAB }),
      },
      TIMEOUT_MS,
    );
    if (!Array.isArray(data?.Items)) throw new Error("the calls list had no Items");
    items.push(...data.Items);
    if (!data.HasMore || data.Items.length === 0) break;
  }
  return { Items: items, HasMore: false };
}

export const energimyndighetenCollector: Collector = {
  source: "energimyndigheten",
  label: "Energimyndigheten",
  async collect() {
    const { data, ...status } = await liveOrCached(fetchCalls, recorded);
    return { items: parseEnergimyndigheten(data, new Date()), ...status };
  },
};
