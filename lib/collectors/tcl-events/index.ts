/**
 * Tech Concept Lab events (A25). TCL is Blue Science Park's platform for
 * digital innovation in Karlskrona; its site is WordPress with an `event`
 * post type. Live from the REST API, with ./recorded.json as the fallback.
 */
import { fetchJson, liveOrCached, type Recorded } from "../cache";
import type { Collector } from "../types";
import { USER_AGENT } from "../../fetcher/fetch-page";
import { parseTclEvents } from "./parse";
import { WP_FIELDS, WpPosts, type WpPost } from "./wordpress";
import recordedJson from "./recorded.json";

export const TCL_EVENTS_API = `https://techconceptlab.com/wp-json/wp/v2/event?per_page=100&_fields=${WP_FIELDS}`;

export const tclEventsCollector: Collector = {
  source: "tcl_events",
  label: "Tech Concept Lab",
  async collect() {
    const recorded: Recorded<WpPost[]> = { recordedAt: recordedJson.recordedAt, data: WpPosts.parse(recordedJson.data) };
    const live = async () => WpPosts.parse(await fetchJson(TCL_EVENTS_API, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } }));
    const { data, ...status } = await liveOrCached(live, recorded);
    return { ...status, items: parseTclEvents(data, new Date()) };
  },
};
