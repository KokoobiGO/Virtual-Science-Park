/**
 * Scout's keyed web search (B1): Tavily or Brave Search, picked by which key
 * is in the environment (TAVILY_API_KEY first, then BRAVE_SEARCH_API_KEY).
 * Without either key nothing is called: searchWeb() answers "no-key" and the
 * agent says "no web search key configured" once in the progress lines.
 *
 * Each provider gets the domain allow-list where it can take it (Tavily's
 * include_domains, Brave's site: operators), and every URL is checked against
 * ALLOWED_WEB_DOMAINS again here. The agent allows WEB_SEARCHES_PER_RUN calls
 * per brief, inside the SCOUT_MAX_SEARCHES cap. Hits the store already has
 * are replaced by the stored hit, and every hit is checked by detectInjection.
 */
import { cutText } from "../embeddings/text";
import { fetchApiJson, type FetchJson } from "./fetch-json";
import { injectionLabel } from "./live-sources";
import { ALLOWED_WEB_DOMAINS, findStoredHits, isAllowedUrl, mergeWithStore, SNIPPET_CHARS, WEB_LIMIT } from "./search";
import type { ScoutHit, SearchHit } from "./types";
import { BRAVE_NAME, braveRequest, parseBrave } from "./web-brave";
import { parseTavily, TAVILY_NAME, tavilyRequest } from "./web-tavily";

/** Keyed web searches per brief, at most: free plans have a monthly quota. */
export const WEB_SEARCHES_PER_RUN = 3;

/** Said once in the progress lines when neither key is set. */
export const NO_WEB_KEY = "no web search key configured";

export type WebProvider = {
  name: string;
  search(query: string, ctx: { fetchJson: FetchJson; domains: readonly string[]; limit: number }): Promise<SearchHit[]>;
};

export function tavilyProvider(apiKey: string): WebProvider {
  return {
    name: TAVILY_NAME,
    search: async (query, { fetchJson, domains, limit }) => parseTavily(await fetchJson(tavilyRequest(query, { apiKey, domains, maxResults: limit * 2 }))),
  };
}

export function braveProvider(apiKey: string): WebProvider {
  return {
    name: BRAVE_NAME,
    search: async (query, { fetchJson, domains, limit }) => parseBrave(await fetchJson(braveRequest(query, { apiKey, domains, count: limit * 2 }))),
  };
}

/** The provider whose key is set, Tavily first; null when neither is. */
export function webProviderFromEnv(env: Record<string, string | undefined> = process.env): WebProvider | null {
  const tavily = env.TAVILY_API_KEY?.trim();
  if (tavily) return tavilyProvider(tavily);
  const brave = env.BRAVE_SEARCH_API_KEY?.trim();
  if (brave) return braveProvider(brave);
  return null;
}

export type WebSearchOutcome =
  | { status: "no-key" }
  | { status: "answered"; provider: string; hits: ScoutHit[]; at: string; inStore: number; flagged: number }
  | { status: "failed"; provider: string; error: string };

export type WebSearchOptions = {
  provider: WebProvider | null;
  domains?: readonly string[];
  limit?: number;
  fetchJson?: FetchJson;
  now?: () => Date;
  /** The store rows behind hits (search.ts findStoredHits); tests pass their own. */
  findStored?: (hits: ScoutHit[]) => Promise<ScoutHit[]>;
};

/** One keyed web search. Never throws: a missing key or a failed call is the outcome. */
export async function searchWeb(query: string, options: WebSearchOptions): Promise<WebSearchOutcome> {
  const { provider, domains = ALLOWED_WEB_DOMAINS, limit = WEB_LIMIT, fetchJson = fetchApiJson, now = () => new Date(), findStored = (hits) => findStoredHits(hits) } = options;
  if (!provider) return { status: "no-key" };
  let raw: SearchHit[];
  try {
    raw = await provider.search(query, { fetchJson, domains, limit });
  } catch (error) {
    // The messages name the host and the status, never the key (fetch-json.ts).
    return { status: "failed", provider: provider.name, error: (error instanceof Error ? error.message : String(error)).slice(0, 160) };
  }
  const at = now().toISOString();
  const seen = new Set<string>();
  const hits = raw
    .filter((hit) => isAllowedUrl(hit.url, domains) && !seen.has(hit.url) && seen.add(hit.url))
    .slice(0, limit)
    .map((hit): ScoutHit => {
      const webHit: ScoutHit = {
        title: hit.title,
        url: hit.url,
        // The writer reads the snippet as the description: a little more than a store snippet.
        snippet: cutText(hit.snippet, SNIPPET_CHARS * 2),
        origin: "web",
        retrievedAt: at,
        sourceName: new URL(hit.url).hostname.replace(/^www\./, ""),
        liveSource: provider.name,
      };
      return { ...webHit, injection: injectionLabel(webHit) };
    });
  const flagged = hits.filter((hit) => hit.injection).length;
  let stored: ScoutHit[] = [];
  try {
    stored = await findStored(hits);
  } catch {
    // Without the lookup a page may show twice (stored and web); the run still has every hit.
  }
  const merged = mergeWithStore(hits, stored);
  return { status: "answered", provider: provider.name, hits: merged.hits, at, inStore: merged.inStore, flagged };
}
