/**
 * Adapter for the EU Funding & Tenders search API (A11).
 *
 * This is the API the portal's own search page calls. It is not documented and
 * may change without notice, so everything that depends on it lives in this
 * file: the address and key, the multipart form it expects, its codes and its
 * page size. When it fails, the collector uses recorded.json instead.
 *
 * How it behaves (checked 2026-11-14): POST only (GET answers 405). The form
 * parts `query` and `languages` must be sent as application/json parts; plain
 * text parts answer 500. `text=***` matches every topic. Words in one text are
 * OR'ed and the best matches come first. `pageSize` is capped at 100. A
 * `terms` query on `identifier` matches exact identifiers only (case counts).
 */
import { fetchJson } from "../cache";

/** Programmes a search can be limited to. Codes come from the API's facet list (POST /rest/facet). */
const PROGRAMMES = {
  HORIZON: { field: "frameworkProgramme", code: "43108390" }, // Horizon Europe
  EDF: { field: "frameworkProgramme", code: "44181033" }, // European Defence Fund
  DIGITAL: { field: "frameworkProgramme", code: "43152860" }, // Digital Europe Programme
  EMFAF: { field: "frameworkProgramme", code: "43392145" }, // European Maritime, Fisheries and Aquaculture Fund
  EIC: { field: "programmeDivision", code: "43121666" }, // European Innovation Council, a part of Horizon Europe
} as const;

type Programme = keyof typeof PROGRAMMES;

export type EuSearch = {
  /** Words to look for, OR'ed. "***" matches every topic. */
  text: string;
  /** Defaults to Horizon Europe, the Defence Fund, Digital Europe and EMFAF. */
  programmes?: Programme[];
  /** How many of the best matches to take (at most 100). Defaults to 25. */
  pageSize?: number;
};

/**
 * What to search for: one search per member area (marine technology, defence,
 * cyber security, AI, energy, sensors), plus every open topic of the programmes
 * that fit the members as a whole. The searches run in parallel; the parser
 * merges them, removes duplicates and keeps the nearest deadlines.
 * Edit this list to change which calls the members see.
 */
export const EU_SEARCHES: EuSearch[] = [
  { text: "maritime marine ocean underwater offshore" },
  { text: "defence military" },
  { text: "cybersecurity cyber" },
  { text: "artificial intelligence" },
  { text: "energy battery hydrogen" },
  // No stemming: "sensor" does not find "sensors". "sensing" pulled in culture and democracy calls.
  { text: "sensor sensors radar sonar lidar photonics" },
  // Text search misses most Defence Fund topics, so take these programmes whole (about 30 topics).
  { text: "***", programmes: ["EIC", "EDF", "DIGITAL", "EMFAF"], pageSize: 100 },
];

const DEFAULT_PROGRAMMES: Programme[] = ["HORIZON", "EDF", "DIGITAL", "EMFAF"];
// The text search scores whole calls alike, so past the first 25 or so hits
// it is mostly sibling topics of a matching call (health topics for "cyber").
const DEFAULT_PAGE_SIZE = 25;
const SEARCH_URL = "https://api.tech.ec.europa.eu/search-api/prod/rest/search";
/** Per request. The searches run in parallel, so a whole run stays under this too. */
const TIMEOUT_MS = 15_000;
/** Type "1" is a call for proposals topic (a grant). 0 is a tender, 2 an external-aid grant, 8 cascade funding. */
const TYPE_GRANT = "1";

/** Status codes of a topic. */
export const EU_STATUS = { forthcoming: "31094501", open: "31094502" } as const;

/**
 * One search hit as the API returns it. Only the fields the parser reads are
 * listed. Every metadata value is a list of strings; dates look like
 * "2027-10-07T00:00:00.000+0000" (the calendar day, no time).
 */
export type EuSearchHit = {
  summary?: string;
  metadata: {
    /** The topic identifier, e.g. "HORIZON-CL5-2027-06-D6-11". */
    identifier?: string[];
    title?: string[];
    /** One of EU_STATUS. */
    status?: string[];
    /** Opening date. */
    startDate?: string[];
    /** One date per cut-off, oldest first. Two-stage topics have one per stage. */
    deadlineDate?: string[];
    /** The topic text (expected outcome, scope) as HTML. */
    descriptionByte?: string[];
    /** Type of action, e.g. "HORIZON EIC Accelerator". */
    typesOfAction?: string[];
  };
};

/** Open and forthcoming grant topics from every search in EU_SEARCHES, in search order, duplicates included. */
export async function searchEuFunding(now = new Date(), searches = EU_SEARCHES): Promise<EuSearchHit[]> {
  const pages = await Promise.all(searches.map((search) => searchOnce(search, now)));
  return pages.flat();
}

async function searchOnce(search: EuSearch, now: Date): Promise<EuSearchHit[]> {
  const pageSize = Math.min(search.pageSize ?? DEFAULT_PAGE_SIZE, 100);
  const data = await post(search.text, pageSize, buildQuery(search.programmes ?? DEFAULT_PROGRAMMES, now));
  if (!Array.isArray(data.results)) throw new Error(`the EU search for "${search.text}" answered without a results list`);
  return data.results;
}

/** Identifiers per lookup. A page holds 100 hits, so this leaves room. */
const LOOKUP_BATCH = 50;

/**
 * Which of these topic identifiers the portal knows (A20: the link checker
 * uses it, because the portal's topic page answers 200 for any id). The match
 * is exact, case and suffix included. Closed and withdrawn topics are found
 * too, since their pages still open. One request per 50 identifiers, one after
 * another. Throws when the API fails or answers in a shape we do not expect,
 * so the caller never takes "not found" from a failed request.
 */
export async function lookupEuTopics(identifiers: readonly string[]): Promise<Set<string>> {
  const unique = [...new Set(identifiers)];
  const found = new Set<string>();
  for (let i = 0; i < unique.length; i += LOOKUP_BATCH) {
    const batch = unique.slice(i, i + LOOKUP_BATCH);
    const data = await post("***", 100, { bool: { must: [{ terms: { identifier: batch } }] } });
    if (!Array.isArray(data.results)) throw new Error("the EU topic lookup answered without a results list");
    if (typeof data.totalResults === "number" && data.totalResults > data.results.length) {
      throw new Error(`the EU topic lookup found ${data.totalResults} hits but returned ${data.results.length}`);
    }
    for (const hit of data.results) {
      const id = hit.metadata?.identifier?.[0];
      if (id && batch.includes(id)) found.add(id);
    }
  }
  return found;
}

/** One POST to the search API: the form it expects, the first page only. */
async function post(text: string, pageSize: number, query: unknown) {
  const params = new URLSearchParams({ apiKey: "SEDIA", text, pageSize: String(pageSize), pageNumber: "1" });
  const form = new FormData();
  form.append("query", jsonPart(query));
  form.append("languages", jsonPart(["en"]));
  return fetchJson<{ totalResults?: number; results?: EuSearchHit[] }>(`${SEARCH_URL}?${params}`, { method: "POST", body: form }, TIMEOUT_MS);
}

function buildQuery(programmes: Programme[], now: Date) {
  const codesByField: Record<string, string[]> = {};
  for (const { field, code } of programmes.map((p) => PROGRAMMES[p])) (codesByField[field] ??= []).push(code);
  // The index keeps many closed topics with an open or forthcoming status, so
  // ask only for topics with a cut-off from today on. The date needs this full
  // form; a bare "2026-11-14" is ignored. A forthcoming topic with no deadline
  // yet is let through; the parser decides about it.
  const today = `${now.toISOString().slice(0, 10)}T00:00:00.000+0000`;
  return {
    bool: {
      must: [
        { terms: { type: [TYPE_GRANT] } },
        { terms: { status: [EU_STATUS.forthcoming, EU_STATUS.open] } },
        { bool: { should: Object.entries(codesByField).map(([field, codes]) => ({ terms: { [field]: codes } })) } },
        { bool: { should: [{ range: { deadlineDate: { gte: today } } }, { bool: { must_not: [{ exists: { field: "deadlineDate" } }] } }] } },
      ],
    },
  };
}

function jsonPart(value: unknown) {
  return new Blob([JSON.stringify(value)], { type: "application/json" });
}
