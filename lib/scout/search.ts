/**
 * Scout's search (B1). NVIDIA's API has no web search, so Scout brings its
 * own, behind one small adapter interface: `search(query)` answers with
 * `{ title, url, snippet }` hits (plus what the source knows about them).
 * The model asks `search(query, kind)` once; the code asks, in this order:
 *
 * - store (this file): BSP's own opportunity store, by embedding similarity
 *   of the query (Voyage, the same vectors as the matcher) and, when the
 *   embedding call fails or is rate limited, by bilingual keywords
 *   (keywords.ts). Fixtures (external id "fixture-...") never come back, nor
 *   closed calls, past events or news.
 * - live sources (live-sources.ts): the funders' own public search APIs,
 *   asked at question time, so calls newer than the last collect are found.
 *   A live hit the store already has is replaced by the stored hit
 *   (findStoredHits, mergeWithStore), so it is never listed twice.
 * - web (web-search.ts): Tavily or Brave Search when their key is set.
 *
 * Every live and web hit must be on ALLOWED_WEB_DOMAINS. DuckDuckGo's HTML
 * page, the web source before, answered every request with a bot check
 * (HTTP 202, measured 2026-11-14), so it was removed.
 *
 * Jobs and scripts only: the store search reads with getDb().
 */
import { and, asc, cosineDistance, eq, gte, inArray, isNotNull, isNull, ne, notLike, or, sql, type SQL } from "drizzle-orm";
import { getDb, type Db } from "../db";
import { opportunities, sourceStatus } from "../db/schema";
import { cutText } from "../embeddings/text";
import { FIXTURE_PREFIX } from "../matcher/score";
import type { OpportunityKind, SourceState } from "../schemas";
import { voyageEmbed } from "../voyage";
import { hasSpecific, keywordPlan, rankByKeywords } from "./keywords";
import type { ScoutHit, SourceOrigin } from "./types";

/** The adapter interface (B1). */
export interface SearchSource {
  readonly name: SourceOrigin;
  search(query: string, options?: { kind?: OpportunityKind }): Promise<ScoutHit[]>;
}

/** Hits per search and source. */
export const STORE_LIMIT = 8;
export const WEB_LIMIT = 5;

/** Shown in the loop's search results; the writer reads up to STORE_DESCRIPTION_CHARS. */
export const SNIPPET_CHARS = 350;
export const STORE_DESCRIPTION_CHARS = 1500;

/** A query embedding that takes longer than this falls back to keywords. Voyage's client has no timeout of its own. */
const EMBED_TIMEOUT_MS = 10_000;

/** Searches per brief when SCOUT_MAX_SEARCHES is not set. */
export const DEFAULT_MAX_SEARCHES = 6;

/** SCOUT_MAX_SEARCHES, or the default. A value that is not a whole number from 1 to 20 is ignored. */
export function maxSearches(env: string | undefined = process.env.SCOUT_MAX_SEARCHES): number {
  const value = Number(env);
  return env && Number.isInteger(value) && value >= 1 && value <= 20 ? value : DEFAULT_MAX_SEARCHES;
}

const collapse = (text: string) => text.replace(/\s+/g, " ").trim();

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

/** What the store search did, for the progress line. */
export type StoreSearch = { hits: ScoutHit[]; method: "embedding" | "keywords"; fallbackReason?: string };

type StoreRow = {
  id: string;
  kind: OpportunityKind;
  source: string;
  /** Optional: rows read before live search matched on it carry none. */
  externalId?: string;
  title: string;
  url: string;
  description: string | null;
  deadline: Date | null;
  eventDate: Date | null;
  contact: string | null;
  eligibilityText: string | null;
  retrievedAt: Date;
  simulated: boolean;
  /** From source_status (left join on its label); null when the source has no status row. */
  sourceState: SourceState | null;
  sourceCachedAt: Date | null;
};

/** Every store query joins the source's status by label, for the citation's data status label (D20). */
const statusJoin = eq(sourceStatus.label, opportunities.source);

const storeColumns = {
  id: opportunities.id,
  kind: opportunities.kind,
  source: opportunities.source,
  externalId: opportunities.externalId,
  title: opportunities.title,
  url: opportunities.url,
  description: opportunities.description,
  deadline: opportunities.deadline,
  eventDate: opportunities.eventDate,
  contact: opportunities.contact,
  eligibilityText: opportunities.eligibilityText,
  retrievedAt: opportunities.retrievedAt,
  simulated: opportunities.simulated,
  sourceState: sourceStatus.state,
  sourceCachedAt: sourceStatus.cachedAt,
};

/** Current, real opportunities: no fixtures, no news, no closed calls, no past events. */
function openPool(now: Date, kind?: OpportunityKind): SQL {
  return and(
    notLike(opportunities.externalId, `${FIXTURE_PREFIX}%`),
    ne(opportunities.kind, "news"),
    or(ne(opportunities.kind, "funding"), isNull(opportunities.deadline), gte(opportunities.deadline, now)),
    or(ne(opportunities.kind, "event"), isNull(opportunities.eventDate), gte(opportunities.eventDate, now)),
    kind ? eq(opportunities.kind, kind) : undefined,
  )!;
}

export function storeHit(row: StoreRow): ScoutHit {
  const description = row.description ? collapse(row.description) : "";
  return {
    title: collapse(row.title),
    url: row.url,
    snippet: description ? cutText(description, SNIPPET_CHARS) : collapse(row.title),
    origin: "store",
    retrievedAt: row.retrievedAt.toISOString(),
    opportunityId: row.id,
    kind: row.kind,
    sourceName: row.source,
    externalId: row.externalId ?? null,
    deadline: row.deadline?.toISOString() ?? null,
    eventDate: row.eventDate?.toISOString() ?? null,
    contact: row.contact ? collapse(row.contact) : null,
    eligibilityText: row.eligibilityText ? collapse(row.eligibilityText) : null,
    description: description ? cutText(description, STORE_DESCRIPTION_CHARS) : null,
    simulated: row.simulated,
    sourceState: row.sourceState,
    sourceCachedAt: row.sourceCachedAt?.toISOString() ?? null,
  };
}

async function embedQuery(query: string, embed: typeof voyageEmbed): Promise<number[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`no embedding in ${EMBED_TIMEOUT_MS / 1000} s`)), EMBED_TIMEOUT_MS);
  });
  try {
    const [vector] = await Promise.race([embed([query], { inputType: "query" }), timeout]);
    return vector;
  } finally {
    clearTimeout(timer);
  }
}

export type StoreSearchOptions = {
  kind?: OpportunityKind;
  limit?: number;
  db?: Db;
  now?: Date;
  embed?: typeof voyageEmbed;
  /** The asking company: the keyword fallback breaks ties by closeness to its stored embedding. */
  companyId?: string;
};

/**
 * The nearest current opportunities to the query by embedding. When Voyage
 * fails (its free tier allows 3 requests a minute), the same pool by
 * keywords instead (keywords.ts): English and Swedish words of the term map,
 * tags and other query words, in title and text; ties, and the rest when
 * fewer match, by closeness to the company's own stored embedding (personal,
 * else public), which needs no new Voyage call. A query with only generic
 * words is ranked by them and that closeness.
 */
export async function searchStore(query: string, options: StoreSearchOptions = {}): Promise<StoreSearch> {
  const { kind, limit = STORE_LIMIT, db = getDb(), now = new Date(), embed = voyageEmbed, companyId } = options;
  const pool = openPool(now, kind);
  try {
    const vector = await embedQuery(query, embed);
    const distance = cosineDistance(opportunities.embedding, vector);
    const rows = await db
      .select(storeColumns)
      .from(opportunities)
      .leftJoin(sourceStatus, statusJoin)
      .where(and(isNotNull(opportunities.embedding), pool))
      .orderBy(asc(distance))
      .limit(limit);
    return { hits: rows.map(storeHit), method: "embedding" };
  } catch (error) {
    const fallbackReason = error instanceof Error ? error.message.slice(0, 160) : String(error);
    const plan = keywordPlan(query);
    if (!hasSpecific(plan) && !companyId) return { hits: [], method: "keywords", fallbackReason };
    const closeness = companyId
      ? sql<number>`coalesce(1 - (${opportunities.embedding} <=> (
          select coalesce(cp.personal_embedding, c.public_embedding) from companies c
          left join company_private cp on cp.company_id = c.id where c.id = ${companyId}::uuid)), 0)::float8`
      : sql<number>`0::float8`;
    // The open pool is a few hundred rows: rank them here, where å, ä and ö compare the same on any database.
    const rows = await db
      .select({ ...storeColumns, tags: opportunities.tags, closeness })
      .from(opportunities)
      .leftJoin(sourceStatus, statusJoin)
      .where(pool);
    const ranked = rankByKeywords(
      rows.map((row) => ({ ...row, closeness: Number(row.closeness) || 0 })),
      plan,
      { limit, fill: Boolean(companyId) },
    );
    return { hits: ranked.map(storeHit), method: "keywords", fallbackReason };
  }
}

export const storeSource: SearchSource = {
  name: "store",
  search: async (query, options) => (await searchStore(query, options)).hits,
};

// ---------------------------------------------------------------------------
// Web
// ---------------------------------------------------------------------------

/**
 * Sites a web hit may come from: the funders, test facilities and networks
 * the collectors already read (lib/collectors, data/*.json), plus the EU.
 * A host matches a domain or any subdomain of it.
 */
export const ALLOWED_WEB_DOMAINS: readonly string[] = [
  "vinnova.se",
  "energimyndigheten.se",
  "europa.eu",
  "ri.se",
  "bth.se",
  "bluesciencepark.se",
  "mtcos.se",
  "foi.se",
  "fmv.se",
  "almi.se",
  "regionblekinge.se",
  "southbaltic.eu",
  "techconceptlab.com",
  "ai.se",
];

export function isAllowedUrl(url: string, domains: readonly string[] = ALLOWED_WEB_DOMAINS): boolean {
  let host: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    host = parsed.hostname.toLowerCase();
  } catch {
    return false;
  }
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

/**
 * The current store rows behind live or web hits: the same URL, or the same
 * source label and external id (a Vinnova row stored while vinnova.se's page
 * list was down links to the find-funding page, but keeps its diarienummer).
 * Only rows of the open pool count; for a row the store has as closed, the
 * live hit is newer and stays.
 */
export async function findStoredHits(
  hits: Pick<ScoutHit, "url" | "sourceName" | "externalId">[],
  options: { db?: Db; now?: Date } = {},
): Promise<ScoutHit[]> {
  if (!hits.length) return [];
  const { db = getDb(), now = new Date() } = options;
  const ids = new Map<string, Set<string>>();
  for (const hit of hits) {
    if (!hit.sourceName || !hit.externalId) continue;
    if (!ids.has(hit.sourceName)) ids.set(hit.sourceName, new Set());
    ids.get(hit.sourceName)!.add(hit.externalId);
  }
  const match = or(
    inArray(opportunities.url, [...new Set(hits.map((h) => h.url))]),
    ...[...ids].map(([source, set]) => and(eq(opportunities.source, source), inArray(opportunities.externalId, [...set]))),
  );
  const rows = await db.select(storeColumns).from(opportunities).leftJoin(sourceStatus, statusJoin).where(and(openPool(now), match));
  return rows.map(storeHit);
}

/**
 * Live or web hits with every one the store already has replaced by the
 * stored hit (same URL, or same source label and external id), each stored
 * hit once. The stored hit carries more (contact, who may apply) and an
 * opportunity id the company can save.
 */
export function mergeWithStore(hits: ScoutHit[], stored: ScoutHit[]): { hits: ScoutHit[]; inStore: number } {
  const merged: ScoutHit[] = [];
  let inStore = 0;
  for (const hit of hits) {
    const match = stored.find((s) => s.url === hit.url || (!!hit.externalId && s.externalId === hit.externalId && s.sourceName === hit.sourceName));
    if (match) inStore++;
    const keep = match ?? hit;
    if (!merged.some((m) => m.url === keep.url)) merged.push(keep);
  }
  return { hits: merged, inStore };
}
