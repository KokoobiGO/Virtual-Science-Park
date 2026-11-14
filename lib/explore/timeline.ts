/**
 * The explorer's second view (C16): funding call deadlines by month, and dated
 * events by month. Pure, so the grouping is unit-tested.
 */
import { monthKey, monthLabel, monthRange } from "./dates";
import { filterByTagAndQuery, type ExploreFilters, type ExploreItem } from "./filter";

export type MonthGroup<T> = { key: string; label: string; items: T[] };

/** Items grouped by the month of `dateOf`, months and items in date order. */
export function groupByMonth<T>(items: readonly T[], dateOf: (item: T) => Date): MonthGroup<T>[] {
  const sorted = [...items].sort((a, b) => dateOf(a).getTime() - dateOf(b).getTime());
  const groups: MonthGroup<T>[] = [];
  for (const item of sorted) {
    const key = monthKey(dateOf(item));
    const last = groups.at(-1);
    if (last?.key === key) last.items.push(item);
    else groups.push({ key, label: monthLabel(key), items: [item] });
  }
  return groups;
}

/** One bar per month from the first group to the last, empty months included. */
export function monthCounts<T>(groups: readonly MonthGroup<T>[]): { key: string; count: number }[] {
  if (!groups.length) return [];
  const counts = new Map(groups.map((g) => [g.key, g.items.length]));
  return monthRange(groups[0].key, groups.at(-1)!.key).map((key) => ({ key, count: counts.get(key) ?? 0 }));
}

export type Timeline = {
  /** Funding calls whose deadline has not passed, by deadline. Some open later. */
  calls: MonthGroup<ExploreItem>[];
  /** Events with a date that has not passed, by date. */
  events: MonthGroup<ExploreItem>[];
  /** Events stored without a date, such as recurring series. */
  undatedEvents: ExploreItem[];
};

/** The tag and search filters apply; kind and date do not, the timeline picks its own. */
export function buildTimeline(items: readonly ExploreItem[], filters: Pick<ExploreFilters, "tag" | "q">, now: Date): Timeline {
  const base = filterByTagAndQuery(items, filters);
  const upcoming = (date: Date | null): date is Date => date !== null && date.getTime() >= now.getTime();
  return {
    calls: groupByMonth(
      base.filter((i) => i.kind === "funding" && upcoming(i.deadline)),
      (i) => i.deadline!,
    ),
    events: groupByMonth(
      base.filter((i) => i.kind === "event" && upcoming(i.eventDate)),
      (i) => i.eventDate!,
    ),
    undatedEvents: base.filter((i) => i.kind === "event" && !i.eventDate).sort((a, b) => a.title.localeCompare(b.title, "en")),
  };
}
