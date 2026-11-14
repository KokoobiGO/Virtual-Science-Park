/**
 * Scout's search (B1). NVIDIA's API has no web search, so Scout brings its
 * own, behind one small adapter interface: `search(query)` answers with
 * `{ title, url, snippet }` hits (plus what the source knows about them).
 *
 * Two sources sit behind it:
 *
 * - store: BSP's own opportunity store, by embedding similarity of the query
 *   (Voyage, the same vectors as the matcher) and, when the embedding call
 *   fails or is rate limited, by Postgres full-text keywords. Fixtures
 *   (external id "fixture-...") never come back, nor closed calls, past
 *   events or news.
 * - web: DuckDuckGo's HTML endpoint, fetched through the repo's page fetcher,
 *   keeping only hits on ALLOWED_WEB_DOMAINS. Measured from a developer
 *   machine on 2026-11-14: DuckDuckGo answers the fetcher with HTTP 202 and a
 *   "bots use DuckDuckGo too" challenge page, so this source is unavailable
 *   there; it throws WebSearchUnavailable and the run continues on the store.
 *   We never try to get around the challenge.
 *
 * Jobs and scripts only: the store search reads with getDb().
 */
import * as cheerio from "cheerio/slim";
import { and, asc, cosineDistance, desc, eq, gte, isNotNull, isNull, ne, notInArray, notLike, or, sql, type SQL } from "drizzle-orm";
import { getDb, type Db } from "../db";
import { opportunities } from "../db/schema";
import { cutText } from "../embeddings/text";
import { fetchPage, type FetchedPage } from "../fetcher/fetch-page";
import { FIXTURE_PREFIX } from "../matcher/score";
import type { OpportunityKind } from "../schemas";
import { voyageEmbed } from "../voyage";
import type { ScoutHit, SearchHit, SourceOrigin } from "./types";

/** The adapter interface (B1). */
export interface SearchSource {
  readonly name: SourceOrigin;
  search(query: string, options?: { kind?: OpportunityKind }): Promise<ScoutHit[]>;
}

/** Hits per search and source. */
export const STORE_LIMIT = 8;
export const WEB_LIMIT = 6;

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

/**
 * Left out of keyword searches: function words, and words nearly every
 * opportunity has ("funding", "technology"), which on 2026-11-14 ranked
 * battery calls first for "funding for safer electricity grid technology".
 * The search's `kind` already says funding, facility or event.
 */
const STOP_WORDS = new Set(
  [
    "a an and are as at be by can could for from has have how in into is it its of on or our that the their them they this to was we what when where which who will with would you your",
    "och att det som för med på av till är en ett",
    "fund funds funding financing grant grants call calls test tests testing facility facilities testbed testbeds technology technologies tech innovation innovative sweden swedish event events project projects programme program support opportunity opportunities find help want next year fit new",
  ]
    .join(" ")
    .split(" "),
);

/** Words for the keyword fallback: letters and digits only, so they are safe inside to_tsquery. */
export function keywordTerms(query: string): string[] {
  const words = query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return [...new Set(words.filter((w) => w.length >= 3 && !STOP_WORDS.has(w)))].slice(0, 10);
}

type StoreRow = {
  id: string;
  kind: OpportunityKind;
  source: string;
  title: string;
  url: string;
  description: string | null;
  deadline: Date | null;
  eventDate: Date | null;
  contact: string | null;
  eligibilityText: string | null;
  retrievedAt: Date;
};

const storeColumns = {
  id: opportunities.id,
  kind: opportunities.kind,
  source: opportunities.source,
  title: opportunities.title,
  url: opportunities.url,
  description: opportunities.description,
  deadline: opportunities.deadline,
  eventDate: opportunities.eventDate,
  contact: opportunities.contact,
  eligibilityText: opportunities.eligibilityText,
  retrievedAt: opportunities.retrievedAt,
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
    deadline: row.deadline?.toISOString() ?? null,
    eventDate: row.eventDate?.toISOString() ?? null,
    contact: row.contact ? collapse(row.contact) : null,
    eligibilityText: row.eligibilityText ? collapse(row.eligibilityText) : null,
    description: description ? cutText(description, STORE_DESCRIPTION_CHARS) : null,
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
 * keywords instead: most query words matched first, then closest to the
 * company's own stored embedding (personal, else public), which needs no
 * new Voyage call. A query with only generic words is ranked by that
 * closeness alone.
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
      .where(and(isNotNull(opportunities.embedding), pool))
      .orderBy(asc(distance))
      .limit(limit);
    return { hits: rows.map(storeHit), method: "embedding" };
  } catch (error) {
    const fallbackReason = error instanceof Error ? error.message.slice(0, 160) : String(error);
    const terms = keywordTerms(query);
    const document = sql`to_tsvector('english', ${opportunities.title} || ' ' || coalesce(${opportunities.description}, ''))`;
    const matched = terms.length ? sql.join(terms.map((term) => sql`(${document} @@ to_tsquery('english', ${term}))::int`), sql` + `) : sql`0`;
    const closeness = companyId
      ? sql`coalesce(1 - (${opportunities.embedding} <=> (
          select coalesce(cp.personal_embedding, c.public_embedding) from companies c
          left join company_private cp on cp.company_id = c.id where c.id = ${companyId}::uuid)), 0)`
      : sql`0`;
    if (!terms.length && !companyId) return { hits: [], method: "keywords", fallbackReason };
    const rows = await db
      .select(storeColumns)
      .from(opportunities)
      .where(and(pool, terms.length ? sql`${document} @@ to_tsquery('english', ${terms.join(" | ")})` : isNotNull(opportunities.embedding)))
      .orderBy(desc(matched), desc(closeness))
      .limit(limit);
    // English words miss Swedish calls: fill up with what is closest to the company.
    if (companyId && terms.length && rows.length < limit) {
      const found = rows.map((r) => r.id);
      const more = await db
        .select(storeColumns)
        .from(opportunities)
        .where(and(pool, isNotNull(opportunities.embedding), found.length ? notInArray(opportunities.id, found) : undefined))
        .orderBy(desc(closeness))
        .limit(limit - rows.length);
      rows.push(...more);
    }
    return { hits: rows.map(storeHit), method: "keywords", fallbackReason };
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

/** Web search could not be used; the run goes on with the store alone. */
export class WebSearchUnavailable extends Error {}

export const DUCKDUCKGO_HTML = "https://html.duckduckgo.com/html/";

/** DuckDuckGo's answer to a client it takes for a bot: HTTP 202 and a picture challenge. */
export function isBotChallenge(page: Pick<FetchedPage, "status" | "html">): boolean {
  return page.status === 202 || /bots use DuckDuckGo too|anomaly-modal|challenge-form/i.test(page.html);
}

/** The target of a DuckDuckGo result link: "//duckduckgo.com/l/?uddg=<encoded>&rut=..." or a direct URL. */
export function resultTarget(href: string): string | null {
  try {
    const url = new URL(href, "https://duckduckgo.com");
    const target = url.hostname.endsWith("duckduckgo.com") ? url.searchParams.get("uddg") : url.href;
    return target ? new URL(target).href : null;
  } catch {
    return null;
  }
}

/** The organic hits on a DuckDuckGo HTML results page, ads left out. */
export function parseDuckDuckGo(html: string): SearchHit[] {
  const $ = cheerio.load(html);
  const hits: SearchHit[] = [];
  $(".result").each((_, element) => {
    const result = $(element);
    if (result.hasClass("result--ad")) return;
    const link = result.find("a.result__a").first();
    const url = resultTarget(link.attr("href") ?? "");
    const title = collapse(link.text());
    if (!url || !title) return;
    hits.push({ title, url, snippet: collapse(result.find(".result__snippet").first().text()) });
  });
  return hits;
}

export type WebSearchOptions = { limit?: number; fetch?: (url: string) => Promise<FetchedPage>; now?: Date; domains?: readonly string[] };

/** Hits on allowed sites for the query. Throws WebSearchUnavailable when DuckDuckGo cannot be used. */
export async function searchWeb(query: string, options: WebSearchOptions = {}): Promise<ScoutHit[]> {
  const { limit = WEB_LIMIT, fetch = fetchPage, now = new Date(), domains = ALLOWED_WEB_DOMAINS } = options;
  let page: FetchedPage;
  try {
    page = await fetch(`${DUCKDUCKGO_HTML}?q=${encodeURIComponent(query)}`);
  } catch (error) {
    throw new WebSearchUnavailable(`DuckDuckGo could not be reached: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (isBotChallenge(page)) throw new WebSearchUnavailable(`DuckDuckGo answered with a bot check (HTTP ${page.status}).`);
  const hits = parseDuckDuckGo(page.html);
  if (!hits.length && !/class="[^"]*result/.test(page.html)) throw new WebSearchUnavailable("DuckDuckGo's answer had no result list.");
  const seen = new Set<string>();
  return hits
    .filter((hit) => isAllowedUrl(hit.url, domains) && !seen.has(hit.url) && seen.add(hit.url))
    .slice(0, limit)
    .map((hit) => ({ ...hit, origin: "web", retrievedAt: now.toISOString(), sourceName: new URL(hit.url).hostname.replace(/^www\./, "") }));
}

export const duckDuckGoSource: SearchSource = {
  name: "web",
  search: (query) => searchWeb(query),
};
