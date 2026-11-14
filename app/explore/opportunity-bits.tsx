import Link from "next/link";
import { DataStatusLabel, itemDataStatus } from "@/components/data-status-label";
import { clearFiltersHref, hasActiveFilters, type ExploreFilters, type ExploreItem, type MatchInfo } from "@/lib/explore/filter";

/**
 * The product rule (D20): data the team entered by hand, or that comes from a
 * recorded copy of its source, is always labelled. Nothing for an item read live.
 */
export function ItemStatusLabel({ item }: { item: Pick<ExploreItem, "simulated" | "externalId" | "sourceState" | "cachedAt"> }) {
  const kind = itemDataStatus(item);
  return kind ? <DataStatusLabel kind={kind} date={item.cachedAt} /> : null;
}

/** For a member: this opportunity is in the company's own ranked matches. */
export function MatchNote({ match }: { match: MatchInfo }) {
  return (
    <p className="rounded-lg bg-muted px-3 py-2 text-sm break-words">
      <span className="font-medium">Potential match for you, number {match.position} in your ranking.</span>{" "}
      {match.why ?? <span className="text-muted-foreground">Not judged yet, so there is no reason written down.</span>}
    </p>
  );
}

/** The external link to the source page. Long titles wrap, so a phone never scrolls sideways. */
export function SourceLink({ url, title, className }: { url: string; title: string; className?: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={`font-medium break-words underline-offset-4 hover:underline ${className ?? ""}`}>
      {title}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

/**
 * What a view shows when nothing is there: what is missing and what to do.
 * With a filter set, a link that clears them; without one, `empty` explains
 * that nothing of this kind is stored yet.
 */
export function NoResults({ filters, filtered, empty }: { filters: ExploreFilters; filtered: string; empty: string }) {
  const active = hasActiveFilters(filters);
  return (
    <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
      <p>{active ? filtered : empty}</p>
      {active ? (
        <Link href={clearFiltersHref(filters)} className="font-medium text-primary underline-offset-4 hover:underline">
          Clear the filters
        </Link>
      ) : null}
    </div>
  );
}
