/**
 * Tavily's search API as a Scout web provider (B1), used when TAVILY_API_KEY
 * is set. Checked against https://docs.tavily.com/documentation/api-reference/endpoint/search
 * on 2026-11-14:
 *
 *   POST https://api.tavily.com/search
 *   Authorization: Bearer tvly-...
 *   { query, search_depth: "basic" (1 credit), max_results (0 to 20),
 *     topic: "general", include_domains (at most 300), include_answer,
 *     include_raw_content }
 *   -> { query, results: [{ title, url, content, score, ... }], response_time, ... }
 *
 * include_domains restricts the search to the allow-list; web-search.ts
 * checks every URL again. Errors: 401 bad key, 429 rate limit, 432/433 plan
 * limits. Not tried live: no key was available.
 */
import { z } from "zod";
import type { ApiRequest } from "./fetch-json";
import type { SearchHit } from "./types";

export const TAVILY_URL = "https://api.tavily.com/search";
export const TAVILY_NAME = "Tavily web search";

/** Queries are short; this keeps a long one from being refused. */
const MAX_QUERY_CHARS = 300;

export function tavilyRequest(query: string, options: { apiKey: string; domains: readonly string[]; maxResults: number }): ApiRequest {
  return {
    url: TAVILY_URL,
    method: "POST",
    headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query: query.slice(0, MAX_QUERY_CHARS),
      search_depth: "basic",
      max_results: Math.min(Math.max(options.maxResults, 1), 20),
      topic: "general",
      include_domains: [...options.domains],
      include_answer: false,
      include_raw_content: false,
    }),
  };
}

const TavilyResult = z.object({ title: z.string().nullish(), url: z.string(), content: z.string().nullish() });

/** The results as hits; a result without a URL is skipped. Throws when there is no results list. */
export function parseTavily(json: unknown): SearchHit[] {
  const results = (json as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) throw new Error("Tavily answered without a results list");
  const hits: SearchHit[] = [];
  for (const raw of results) {
    const parsed = TavilyResult.safeParse(raw);
    if (!parsed.success) continue;
    const { title, url, content } = parsed.data;
    hits.push({ title: (title ?? "").replace(/\s+/g, " ").trim() || url, url, snippet: (content ?? "").replace(/\s+/g, " ").trim() });
  }
  return hits;
}
