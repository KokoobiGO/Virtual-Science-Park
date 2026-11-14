/**
 * Live source search (B1): the funders' own public search APIs, asked at
 * question time, so Scout finds calls the store does not have yet or that
 * are newer than the last collect. No key is needed.
 *
 * - EU Funding & Tenders portal: the search API the portal's own page calls
 *   (lib/collectors/eu-funding/api.ts has the form it expects). The query's
 *   words go to its text search, which ORs them and puts the best matches
 *   first; open and forthcoming grant topics with a deadline from today on,
 *   in every programme (the collector reads only four).
 * - Vinnova: vinnova.se's "Hitta finansiering" search, the list the collector
 *   reads for page links. One GET of about 35 kB gives every open and planned
 *   round with its page, its three texts (what it funds, who may apply, how
 *   much) and its closing day. The open data API the collector joins it with
 *   takes about 8 s and several requests, too slow for a search step. The list
 *   is in Swedish, so it is ranked here by the bilingual keywords (keywords.ts).
 * - Energimyndigheten: the calls JSON behind energimyndigheten.se/utlysningar,
 *   every open call (about a dozen), ranked here the same way.
 *
 * The collectors' parsers turn the answers into opportunities (imported, not
 * copied). Each source has API_TIMEOUT_MS; a source that fails is reported
 * and the search goes on with the others. Hits off ALLOWED_WEB_DOMAINS are
 * left out, and every hit is checked by detectInjection: a flagged one
 * carries the label. The text stays data: the prompts put it in
 * <untrusted_source> blocks like every other hit.
 *
 * searchLive() then replaces hits the store already has by the stored hit
 * (search.ts mergeWithStore), so the model never sees a call twice.
 */
import { EU_STATUS, type EuSearchHit } from "../collectors/eu-funding/api";
import { parseEuFunding } from "../collectors/eu-funding/parse";
import { LIST_URL as ENERGIMYNDIGHETEN_LIST_URL, parseEnergimyndigheten, type EnergimyndighetenResponse } from "../collectors/energimyndigheten/parse";
import { toInstant } from "../collectors/swedish-time";
import type { CollectedOpportunity } from "../collectors/types";
import { toPlainText as vinnovaText, type VinnovaPage } from "../collectors/vinnova/parse";
import { cutText } from "../embeddings/text";
import { detectInjection } from "../injection/detect";
import type { OpportunityKind } from "../schemas";
import { fetchApiJson, type ApiRequest, type FetchJson } from "./fetch-json";
import { keywordPlan, queryWords, rankByKeywords } from "./keywords";
import { ALLOWED_WEB_DOMAINS, findStoredHits, isAllowedUrl, mergeWithStore, SNIPPET_CHARS, STORE_DESCRIPTION_CHARS } from "./search";
import type { ScoutHit } from "./types";

/** One live source: `name` is what the brief and the citation say, `label` the collector's label that store rows carry. */
export type LiveSourceInfo = { key: "eu" | "vinnova" | "energimyndigheten"; name: string; label: string };

export const EU_LIVE: LiveSourceInfo = { key: "eu", name: "EU Funding & Tenders portal", label: "EU Funding & Tenders" };
export const VINNOVA_LIVE: LiveSourceInfo = { key: "vinnova", name: "Vinnova funding search", label: "Vinnova" };
export const ENERGIMYNDIGHETEN_LIVE: LiveSourceInfo = { key: "energimyndigheten", name: "Energimyndigheten calls list", label: "Energimyndigheten" };

/**
 * Hits per search and live source that the store does not have, at most. Hits
 * the store has are shown as the stored hit and do not use up these places,
 * up to as many again: the store was collected today, so the live sources'
 * best matches are often stored already, and the new calls come after them.
 */
export const LIVE_LIMITS = { eu: 4, vinnova: 2, energimyndigheten: 2 } as const;

/** Candidates asked of each source: enough for its stored hits and its new ones. */
const CANDIDATES_PER_PLACE = 2;

const collapse = (text: string) => text.replace(/\s+/g, " ").trim();

/** A collector's opportunity as a live hit. Calendar days become instants as the store reads them (23:59 Swedish time for a deadline). */
export function liveHit(item: CollectedOpportunity, source: LiveSourceInfo, retrievedAt: string): ScoutHit {
  const description = item.description ? collapse(item.description) : "";
  const instant = (value: string | undefined, endOfDay: boolean) => {
    try {
      return toInstant(value, endOfDay)?.toISOString() ?? null;
    } catch {
      return null;
    }
  };
  const hit: ScoutHit = {
    title: collapse(item.title),
    url: item.url,
    snippet: description ? cutText(description, SNIPPET_CHARS) : collapse(item.title),
    origin: "live",
    retrievedAt,
    opportunityId: null,
    kind: item.kind,
    sourceName: source.label,
    liveSource: source.name,
    externalId: item.externalId,
    opensAt: instant(item.opensAt, false),
    deadline: instant(item.deadline, true),
    eventDate: instant(item.eventDate, false),
    contact: item.contact ? collapse(item.contact) : null,
    eligibilityText: item.eligibilityText ? collapse(item.eligibilityText) : null,
    description: description ? cutText(description, STORE_DESCRIPTION_CHARS) : null,
  };
  return { ...hit, injection: injectionLabel(hit) };
}

/** INJECTION_LABEL when the hit's text looks like instructions to an AI, else null. */
export function injectionLabel(hit: Pick<ScoutHit, "title" | "snippet" | "description" | "eligibilityText" | "contact">): string | null {
  const text = [hit.title, hit.snippet, hit.description, hit.eligibilityText, hit.contact].filter(Boolean).join("\n");
  return detectInjection({ text }).label;
}

// ---------------------------------------------------------------------------
// EU Funding & Tenders portal
// ---------------------------------------------------------------------------

export const EU_SEARCH_URL = "https://api.tech.ec.europa.eu/search-api/prod/rest/search";
/** Type "1" is a call for proposals topic (a grant). */
const EU_TYPE_GRANT = "1";

/** The filter part of the request: open and forthcoming grant topics with a cut-off from today on (or none yet), any programme. */
export function euQuery(now: Date) {
  // The index needs the full form of the date; a bare "2026-11-14" is ignored (api.ts).
  const today = `${now.toISOString().slice(0, 10)}T00:00:00.000+0000`;
  return {
    bool: {
      must: [
        { terms: { type: [EU_TYPE_GRANT] } },
        { terms: { status: [EU_STATUS.forthcoming, EU_STATUS.open] } },
        { bool: { should: [{ range: { deadlineDate: { gte: today } } }, { bool: { must_not: [{ exists: { field: "deadlineDate" } }] } }] } },
      ],
    },
  };
}

/** The POST the portal expects: the text and page in the address, the filter and languages as JSON form parts. */
export function euRequest(words: string[], now: Date, pageSize: number): ApiRequest {
  const params = new URLSearchParams({ apiKey: "SEDIA", text: words.join(" "), pageSize: String(pageSize), pageNumber: "1" });
  const form = new FormData();
  form.append("query", new Blob([JSON.stringify(euQuery(now))], { type: "application/json" }));
  form.append("languages", new Blob([JSON.stringify(["en"])], { type: "application/json" }));
  return { url: `${EU_SEARCH_URL}?${params}`, method: "POST", body: form };
}

/** The portal's hits in its own order (best match first), as opportunities; closed and withdrawn topics are left out by the collector's parser. */
export function euItems(hits: EuSearchHit[], now: Date): CollectedOpportunity[] {
  const items: CollectedOpportunity[] = [];
  for (const hit of hits) {
    // One at a time: parseEuFunding sorts by deadline, and the portal's order is the relevance.
    const [item] = parseEuFunding([hit], now, 1);
    if (item && !items.some((i) => i.externalId === item.externalId)) items.push(item);
  }
  return items;
}

async function searchEu(query: string, ctx: SourceContext): Promise<CollectedOpportunity[] | null> {
  const words = queryWords(query);
  if (!words.length) return null;
  // A few more than needed: the parser leaves out closed and withdrawn topics.
  const data = await ctx.fetchJson<{ results?: EuSearchHit[] }>(euRequest(words, ctx.now, Math.min(ctx.limit + 4, 100)));
  if (!Array.isArray(data.results)) throw new Error("the EU search answered without a results list");
  return euItems(data.results, ctx.now).slice(0, ctx.limit);
}

// ---------------------------------------------------------------------------
// Vinnova
// ---------------------------------------------------------------------------

export const VINNOVA_SEARCH_URL = "https://www.vinnova.se/sok-finansiering/hitta-finansiering/Search/";
const VINNOVA_SITE = "https://www.vinnova.se";

/** One hit of vinnova.se's search: the collector's VinnovaPage with the fields this search reads besides the page link. */
export type VinnovaListHit = Omit<VinnovaPage, "UtlysningSearchFindHit"> & {
  Heading?: string | null;
  Teaser?: string | null;
  UtlysningSearchFindHit?: {
    AoDiarienummer?: string | null;
    /** What it funds, who may apply, how much. */
    Description1?: string | null;
    Description2?: string | null;
    Description3?: string | null;
    /** "is-open" or "is-planned". */
    AnsokomgangStatus?: string | null;
    /** "Stänger 17 nov. 2026" or "Planerad till dec. 2026". */
    AnsokomgangStatusText?: string | null;
    /** For an open round, the closing day; for a planned one, the month it is planned for. */
    AnsokomgangStatusDate?: string | null;
  } | null;
};

/** Open rounds that close after `now`, and planned rounds (with their status text, no deadline). */
export function vinnovaItems(list: VinnovaListHit[], now: Date): CollectedOpportunity[] {
  const items: CollectedOpportunity[] = [];
  for (const hit of list) {
    const round = hit.UtlysningSearchFindHit;
    const title = vinnovaText(hit.Heading);
    if (!round || !hit.Url || !title) continue;
    const day = /^\d{4}-\d{2}-\d{2}$/.test(round.AnsokomgangStatusDate ?? "") ? round.AnsokomgangStatusDate! : undefined;
    const open = round.AnsokomgangStatus === "is-open";
    if (open ? !day || toInstant(day, true)! <= now : round.AnsokomgangStatus !== "is-planned") continue;
    let url: URL;
    try {
      url = new URL(hit.Url, VINNOVA_SITE);
    } catch {
      continue;
    }
    const funds = vinnovaText(round.Description1);
    const amount = vinnovaText(round.Description3);
    const description = [
      vinnovaText(hit.Teaser),
      funds && `Vad kan ni söka för? ${funds}`,
      amount && `Hur mycket kan ni söka? ${amount}`,
      open ? "" : vinnovaText(round.AnsokomgangStatusText),
    ]
      .filter(Boolean)
      .join("\n\n");
    items.push({
      externalId: round.AoDiarienummer?.trim() || url.pathname,
      kind: "funding",
      title,
      url: url.href,
      ...(description ? { description } : {}),
      ...(open && day ? { deadline: day } : {}),
      ...(vinnovaText(round.Description2) ? { eligibilityText: vinnovaText(round.Description2) } : {}),
      ...(hit.PublishedDate && /^\d{4}-\d{2}-\d{2}$/.test(hit.PublishedDate) ? { publishedAt: hit.PublishedDate } : {}),
    });
  }
  return items;
}

async function searchVinnova(query: string, ctx: SourceContext): Promise<CollectedOpportunity[]> {
  const data = await ctx.fetchJson<{ FindHitList?: VinnovaListHit[] }>({ url: VINNOVA_SEARCH_URL });
  if (!Array.isArray(data.FindHitList)) throw new Error("vinnova.se's search answered without a hit list");
  return rankItems(vinnovaItems(data.FindHitList, ctx.now), query, ctx.limit);
}

// ---------------------------------------------------------------------------
// Energimyndigheten
// ---------------------------------------------------------------------------

/** Tab 0 ("Aktuella"): every open call. It pages by 30; there are about a dozen. */
export function energimyndighetenRequest(page: number): ApiRequest {
  return {
    url: ENERGIMYNDIGHETEN_LIST_URL,
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
    body: new URLSearchParams({ Page: String(page), Id: "0" }),
  };
}

const ENERGIMYNDIGHETEN_MAX_PAGES = 2;

async function searchEnergimyndigheten(query: string, ctx: SourceContext): Promise<CollectedOpportunity[]> {
  const items: EnergimyndighetenResponse["Items"] = [];
  for (let page = 1; page <= ENERGIMYNDIGHETEN_MAX_PAGES; page++) {
    const data = await ctx.fetchJson<EnergimyndighetenResponse>(energimyndighetenRequest(page));
    if (!Array.isArray(data?.Items)) throw new Error("Energimyndigheten's calls list had no Items");
    items.push(...data.Items);
    if (!data.HasMore || !data.Items.length) break;
  }
  return rankItems(parseEnergimyndigheten({ Items: items }, ctx.now), query, ctx.limit);
}

// ---------------------------------------------------------------------------
// All live sources
// ---------------------------------------------------------------------------

/** The best `limit` items for the query by the bilingual keywords; none when nothing specific matches. */
export function rankItems(items: CollectedOpportunity[], query: string, limit: number): CollectedOpportunity[] {
  const rows = items.map((item) => ({ item, title: item.title, description: [item.description, item.eligibilityText].filter(Boolean).join(" "), tags: [], closeness: 0 }));
  return rankByKeywords(rows, keywordPlan(query), { limit, fill: false }).map((row) => row.item);
}

type SourceContext = { now: Date; fetchJson: FetchJson; limit: number };

/** One source's search: its items, or null when the query gave it nothing to search for. */
type SourceSearch = (query: string, ctx: SourceContext) => Promise<CollectedOpportunity[] | null>;

export const LIVE_SOURCES: readonly { info: LiveSourceInfo; search: SourceSearch }[] = [
  { info: EU_LIVE, search: searchEu },
  { info: VINNOVA_LIVE, search: searchVinnova },
  { info: ENERGIMYNDIGHETEN_LIVE, search: searchEnergimyndigheten },
];

/** What one live source did in one search, for the progress line and the brief's note. */
export type LiveSourceReport = {
  name: string;
  status: "answered" | "failed" | "skipped";
  results: number;
  /** When it answered or failed (ISO). */
  at: string;
  error?: string;
};

export type LiveSearch = {
  /** Store hits in place of the live hits the store already has. */
  hits: ScoutHit[];
  sources: LiveSourceReport[];
  /** Live hits the store already had. */
  inStore: number;
  /** Hits that carry the injection label. */
  flagged: number;
  /** Set when the kind was not funding: the funders' searches only list funding calls. */
  skipped?: string;
};

export type LiveSearchOptions = {
  kind?: OpportunityKind;
  fetchJson?: FetchJson;
  /** The clock: each source's answer is stamped when it arrives. */
  now?: () => Date;
  sources?: readonly { info: LiveSourceInfo; search: SourceSearch }[];
  domains?: readonly string[];
  /** The store rows behind hits (search.ts findStoredHits); tests pass their own. */
  findStored?: (hits: ScoutHit[]) => Promise<ScoutHit[]>;
};

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 160);

/** Hits of several lists in turn: each list's first, then each one's second, ... */
function interleave<T>(lists: T[][]): T[] {
  const out: T[] = [];
  for (let rank = 0; rank < Math.max(0, ...lists.map((l) => l.length)); rank++) for (const list of lists) if (list[rank]) out.push(list[rank]);
  return out;
}

/**
 * One source's hits in its own order, each the store has replaced by the
 * stored hit: up to `limit` new ones and up to `limit` stored ones.
 */
export function pickWithStore(candidates: ScoutHit[], stored: ScoutHit[], limit: number): { hits: ScoutHit[]; inStore: number } {
  const picked: ScoutHit[] = [];
  let fresh = 0;
  let inStore = 0;
  for (const hit of candidates) {
    const { hits: [kept], inStore: isStored } = mergeWithStore([hit], stored);
    if (isStored ? inStore >= limit : fresh >= limit) continue;
    if (picked.some((p) => p.url === kept.url)) continue;
    picked.push(kept);
    if (isStored) inStore++;
    else fresh++;
  }
  return { hits: picked, inStore };
}

/** Every live source in parallel, merged with the store. Never throws: a failed source or store lookup is reported. */
export async function searchLive(query: string, options: LiveSearchOptions = {}): Promise<LiveSearch> {
  const { kind, fetchJson = fetchApiJson, now = () => new Date(), sources = LIVE_SOURCES, domains = ALLOWED_WEB_DOMAINS, findStored = (hits) => findStoredHits(hits) } = options;
  if (kind && kind !== "funding") {
    return { hits: [], sources: [], inStore: 0, flagged: 0, skipped: "the funders' searches only list funding calls" };
  }
  const started = now();
  const answers = await Promise.all(
    sources.map(async ({ info, search }) => {
      const limit = LIVE_LIMITS[info.key];
      try {
        const items = await search(query, { now: started, fetchJson, limit: limit * CANDIDATES_PER_PLACE });
        const at = now().toISOString();
        if (items === null) return { info, limit, status: "skipped" as const, at, candidates: [] };
        const candidates = items.filter((item) => isAllowedUrl(item.url, domains)).map((item) => liveHit(item, info, at));
        return { info, limit, status: "answered" as const, at, candidates };
      } catch (error) {
        return { info, limit, status: "failed" as const, at: now().toISOString(), candidates: [], error: errorText(error) };
      }
    }),
  );
  let stored: ScoutHit[] = [];
  try {
    stored = await findStored(answers.flatMap((a) => a.candidates));
  } catch {
    // Without the lookup a call may show twice (stored and live); the run still has every hit.
  }
  const picks = answers.map((a) => pickWithStore(a.candidates, stored, a.limit));
  // Each address once (two sources' hits can be the same stored row).
  const hits =interleave(picks.map((p) => p.hits)).filter((hit, i, all) => all.findIndex((h) => h.url === hit.url) === i);
  const sourcesReport: LiveSourceReport[] = answers.map((a, i) => ({
    name: a.info.name,
    status: a.status,
    results: picks[i].hits.length,
    at: a.at,
    ...(a.error ? { error: a.error } : {}),
  }));
  return {
    hits,
    sources: sourcesReport,
    inStore: picks.reduce((n, p) => n + p.inStore, 0),
    flagged: hits.filter((hit) => hit.origin === "live" && hit.injection).length,
  };
}
