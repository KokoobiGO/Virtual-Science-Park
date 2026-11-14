/**
 * Blue Science Park news (A26), from the site's WordPress posts API. The RSS
 * feed (/feed/) has the same posts, but only the latest eight and only their
 * excerpts, so the JSON API is used.
 * Live, with ./recorded.json as the fallback.
 */
import { fetchJson, liveOrCached, type Recorded } from "../cache";
import type { Collector } from "../types";
import { USER_AGENT } from "../../fetcher/fetch-page";
import { WP_FIELDS, WpPosts, type WpPost } from "../tcl-events/wordpress";
import { MAX_NEWS, parseBspNews } from "./parse";
import recordedJson from "./recorded.json";

export const BSP_NEWS_API = `https://www.bluesciencepark.se/wp-json/wp/v2/posts?per_page=${MAX_NEWS}&_fields=${WP_FIELDS}`;

export const bspNewsCollector: Collector = {
  source: "bsp_news",
  label: "Blue Science Park",
  async collect() {
    const recorded: Recorded<WpPost[]> = { recordedAt: recordedJson.recordedAt, data: WpPosts.parse(recordedJson.data) };
    const live = async () => WpPosts.parse(await fetchJson(BSP_NEWS_API, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } }));
    const { data, ...status } = await liveOrCached(live, recorded);
    return { ...status, items: parseBspNews(data, new Date()) };
  },
};
