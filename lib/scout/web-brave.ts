/**
 * Brave's Web Search API as a Scout web provider (B1), used when
 * BRAVE_SEARCH_API_KEY is set and TAVILY_API_KEY is not. Checked against
 * https://api-dashboard.search.brave.com/api-reference/web/search/get on
 * 2026-11-14:
 *
 *   GET https://api.search.brave.com/res/v1/web/search?q=...&count=...
 *   X-Subscription-Token: <key>, Accept: application/json
 *   q: at most 600 characters and 75 words (an older page says 400); count 1 to 20.
 *   -> { type: "search", query: {...}, web: { type: "search", results: [{ title, url, description, page_age, ... }] } }
 *
 * Brave has no domain parameter; it takes "site:" operators in the query and
 * documents OR (whether "site:a OR site:b" binds as one group is not stated),
 * so the allow-list goes into the query and web-search.ts checks every URL
 * again. text_decorations=false asks for descriptions without highlight
 * markup; any tag left is stripped. Not tried live: no key was available.
 */
import { z } from "zod";
import type { ApiRequest } from "./fetch-json";
import type { SearchHit } from "./types";

export const BRAVE_URL = "https://api.search.brave.com/res/v1/web/search";
export const BRAVE_NAME = "Brave web search";

/** The documented floor of the two limits Brave has published. */
export const BRAVE_MAX_QUERY_CHARS = 400;
const MAX_QUESTION_CHARS = 120;

/** The query with the allow-list as "site:" operators, dropping domains from the end when it would be too long. */
export function braveQuery(query: string, domains: readonly string[]): string {
  const words = query.replace(/\s+/g, " ").trim().slice(0, MAX_QUESTION_CHARS);
  const sites = domains.map((d) => `site:${d}`);
  while (sites.length) {
    const q = `${words} ${sites.join(" OR ")}`;
    if (q.length <= BRAVE_MAX_QUERY_CHARS) return q;
    sites.pop();
  }
  return words;
}

export function braveRequest(query: string, options: { apiKey: string; domains: readonly string[]; count: number }): ApiRequest {
  const params = new URLSearchParams({
    q: braveQuery(query, options.domains),
    count: String(Math.min(Math.max(options.count, 1), 20)),
    result_filter: "web",
    text_decorations: "false",
    safesearch: "moderate",
  });
  return { url: `${BRAVE_URL}?${params}`, method: "GET", headers: { "X-Subscription-Token": options.apiKey, Accept: "application/json" } };
}

const BraveResult = z.object({ title: z.string().nullish(), url: z.string(), description: z.string().nullish() });

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

/** Plain text: tags out, the common entities decoded, whitespace squashed. */
const plain = (text: string) =>
  text
    .replace(/<[^>]*>/g, "")
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (_m, name: string) => ENTITIES[name])
    .replace(/\s+/g, " ")
    .trim();

/** The web results as hits; a result without a URL is skipped. Throws when the answer has no web results list. */
export function parseBrave(json: unknown): SearchHit[] {
  const answer = json as { web?: { results?: unknown } } | null;
  const results = answer?.web?.results;
  if (!Array.isArray(results)) {
    // No web block at all is an answer with no web results; anything else is not Brave's shape.
    if (answer && typeof answer === "object" && "query" in answer && !("web" in answer)) return [];
    throw new Error("Brave answered without a web results list");
  }
  const hits: SearchHit[] = [];
  for (const raw of results) {
    const parsed = BraveResult.safeParse(raw);
    if (!parsed.success) continue;
    const { title, url, description } = parsed.data;
    hits.push({ title: plain(title ?? "") || url, url, snippet: plain(description ?? "") });
  }
  return hits;
}
