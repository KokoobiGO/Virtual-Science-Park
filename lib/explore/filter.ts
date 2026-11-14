/**
 * The opportunity explorer's rules (C14), pure so they are unit-tested: the
 * filters in the URL, each item's date status, the order of the list and the
 * member's own ranked matches.
 */
import { OpportunityKind, OpportunityTag, type SourceState } from "../schemas";
import { DAY_MS, daysUntil, formatDay } from "./dates";

/** One opportunity as the explorer shows it. */
export type ExploreItem = {
  id: string;
  kind: OpportunityKind;
  source: string;
  /** The source's own id, e.g. a testbed's slug in data/testbeds.seed.json. */
  externalId: string;
  title: string;
  url: string;
  description: string | null;
  opensAt: Date | null;
  deadline: Date | null;
  eventDate: Date | null;
  tags: string[];
  /** Hand-entered by the team, not read from a live source (only "fixture-" rows are simulated samples). */
  simulated: boolean;
  /** For a test facility: true when an official page confirmed it and that outside companies can use it. */
  verified: boolean | null;
  /** The source's state (source_status.state, matched on its label), for the data status label (D20). Null without a status row. */
  sourceState: SourceState | null;
  /** For a source whose state is cached: when the recorded copy was taken. */
  cachedAt: Date | null;
};

export const KIND_LABELS: Record<OpportunityKind, string> = {
  funding: "Funding call",
  testbed: "Test facility",
  event: "Event",
  news: "News",
};

/** "Closing soon" means a deadline or event date within this many days. */
export const SOON_DAYS = 30;

export const DUE_OPTIONS = {
  open: "Open now",
  soon: `Closing within ${SOON_DAYS} days`,
  none: "No date",
} as const;
export type Due = keyof typeof DUE_OPTIONS;

export const EXPLORE_VIEWS = ["list", "timeline", "map"] as const;
export type ExploreView = (typeof EXPLORE_VIEWS)[number];

export type ExploreFilters = {
  kind: OpportunityKind | null;
  tag: OpportunityTag | null;
  due: Due | null;
  /** Words that must all appear in the title. */
  q: string;
  view: ExploreView;
};

export const NO_FILTERS: ExploreFilters = { kind: null, tag: null, due: null, q: "", view: "list" };

/** The page title of each view; the layout adds the site name. */
export const EXPLORE_VIEW_TITLES: Record<ExploreView, string> = {
  list: "Explore",
  timeline: "Deadline timeline · Explore",
  map: "Test facility map · Explore",
};

export const MAX_QUERY_CHARS = 100;

type Params = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** The filters from the URL. Unknown values are ignored, never an error. */
export function parseFilters(params: Params): ExploreFilters {
  const kind = OpportunityKind.safeParse(first(params.kind));
  const tag = OpportunityTag.safeParse(first(params.tag));
  const due = first(params.due);
  const view = first(params.view);
  return {
    kind: kind.success ? kind.data : null,
    tag: tag.success ? tag.data : null,
    due: due && Object.hasOwn(DUE_OPTIONS, due) ? (due as Due) : null,
    q: (first(params.q) ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_CHARS),
    view: EXPLORE_VIEWS.find((v) => v === view) ?? "list",
  };
}

/** The query string for these filters, with `changes` applied. Empty values are left out. */
export function filtersToQuery(filters: ExploreFilters, changes: Partial<ExploreFilters> = {}): string {
  const merged = { ...filters, ...changes };
  const params = new URLSearchParams();
  if (merged.view !== "list") params.set("view", merged.view);
  if (merged.kind) params.set("kind", merged.kind);
  if (merged.tag) params.set("tag", merged.tag);
  if (merged.due) params.set("due", merged.due);
  if (merged.q) params.set("q", merged.q);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** True when a filter narrows this view. The timeline and the map apply only the tag and the search. */
export function hasActiveFilters(filters: ExploreFilters): boolean {
  if (filters.tag || filters.q) return true;
  return filters.view === "list" && Boolean(filters.kind || filters.due);
}

/** The same view with every filter removed. */
export function clearFiltersHref(filters: Pick<ExploreFilters, "view">): string {
  return `/explore${filtersToQuery(NO_FILTERS, { view: filters.view })}`;
}

/** The date that decides an item's status: a call's deadline, an event's date. */
export function keyDate(item: Pick<ExploreItem, "deadline" | "eventDate">): Date | null {
  return item.deadline ?? item.eventDate;
}

export type DateStatus = "closing_soon" | "open" | "opens_later" | "no_date" | "closed";

export function dateStatus(item: Pick<ExploreItem, "deadline" | "eventDate" | "opensAt">, now: Date): DateStatus {
  const date = keyDate(item);
  if (!date) return "no_date";
  if (date.getTime() < now.getTime()) return "closed";
  if (item.opensAt && item.opensAt.getTime() > now.getTime()) return "opens_later";
  return date.getTime() - now.getTime() <= SOON_DAYS * DAY_MS ? "closing_soon" : "open";
}

export function matchesDue(status: DateStatus, due: Due | null): boolean {
  if (!due) return true;
  if (due === "open") return status === "open" || status === "closing_soon";
  if (due === "soon") return status === "closing_soon";
  return status === "no_date";
}

/** Lower case, without accents, so "forsvar" finds "Försvar". */
export function searchKey(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** True when every word of the query is in the title. An empty query matches everything. */
export function matchesQuery(title: string, q: string): boolean {
  const words = searchKey(q).split(/\s+/).filter(Boolean);
  const haystack = searchKey(title);
  return words.every((word) => haystack.includes(word));
}

/** Coming dates first (soonest first), then items without a date, then closed ones (latest first). */
const STATUS_GROUP: Record<DateStatus, number> = { closing_soon: 0, open: 0, opens_later: 0, no_date: 1, closed: 2 };

export function compareItems(now: Date) {
  return (a: ExploreItem, b: ExploreItem): number => {
    const groupA = STATUS_GROUP[dateStatus(a, now)];
    const groupB = STATUS_GROUP[dateStatus(b, now)];
    if (groupA !== groupB) return groupA - groupB;
    const dateA = keyDate(a)?.getTime();
    const dateB = keyDate(b)?.getTime();
    if (dateA !== undefined && dateB !== undefined && dateA !== dateB) return groupA === 2 ? dateB - dateA : dateA - dateB;
    return a.title.localeCompare(b.title, "en");
  };
}

/** The items that pass the tag and search filters, the two that the timeline uses too. */
export function filterByTagAndQuery<T extends Pick<ExploreItem, "tags" | "title">>(items: readonly T[], filters: Pick<ExploreFilters, "tag" | "q">): T[] {
  return items.filter((item) => (!filters.tag || item.tags.includes(filters.tag)) && matchesQuery(item.title, filters.q));
}

/** The list view: every filter applied, in list order. */
export function filterItems(items: readonly ExploreItem[], filters: ExploreFilters, now: Date): ExploreItem[] {
  return filterByTagAndQuery(items, filters)
    .filter((item) => (!filters.kind || item.kind === filters.kind) && matchesDue(dateStatus(item, now), filters.due))
    .sort(compareItems(now));
}

/** One line on an item's date, e.g. "Deadline 1 Dec 2027" or "Opens 3 Aug 2027, deadline 1 Dec 2027". */
export function dateLabel(item: Pick<ExploreItem, "kind" | "deadline" | "eventDate" | "opensAt">, now: Date): string {
  const status = dateStatus(item, now);
  const date = keyDate(item);
  if (!date) return "No date";
  const isEvent = !item.deadline;
  const day = formatDay(date);
  if (status === "closed") return isEvent ? `Took place ${day}` : `Closed ${day}`;
  const main = isEvent ? day : `Deadline ${day}`;
  if (status === "opens_later") return `Opens ${formatDay(item.opensAt!)}, deadline ${day}`;
  if (status === "closing_soon") {
    const days = daysUntil(date, now);
    return `${main} (${days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`})`;
  }
  return main;
}

// ---------------------------------------------------------------------------
// The member's own ranked matches
// ---------------------------------------------------------------------------

/** A personal match row as stored. */
export type MatchRow = { opportunityId: string; rank: number | null; rejected: boolean; why: string | null };

/** `position` counts only kept matches, so it is the place the member sees in their own list. */
export type MatchInfo = { position: number; rank: number; why: string | null };

/**
 * The member's ranked matches by opportunity. A row the judge rejected is never
 * a match, and neither is one that fell out of the top 20 (rank null).
 */
export function personalMatchMap(rows: readonly MatchRow[]): Map<string, MatchInfo> {
  const kept = rows.filter((r) => r.rank !== null && !r.rejected).sort((a, b) => a.rank! - b.rank!);
  return new Map(kept.map((r, i) => [r.opportunityId, { position: i + 1, rank: r.rank!, why: r.why?.trim() || null }]));
}
