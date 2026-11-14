import Link from "next/link";
import { DataStatusLabel, itemDataStatus } from "@/components/data-status-label";
import { clearFiltersHref, hasActiveFilters, type ExploreFilters, type ExploreItem, type MatchInfo } from "@/lib/explore/filter";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { createTranslator } from "@/lib/i18n/translate";

/**
 * The product rule (D20): data the team entered by hand, or that comes from a
 * recorded copy of its source, is always labelled. Nothing for an item read live.
 */
export function ItemStatusLabel({
  item,
  locale = DEFAULT_LOCALE,
}: {
  item: Pick<ExploreItem, "simulated" | "externalId" | "sourceState" | "cachedAt">;
  locale?: Locale;
}) {
  const kind = itemDataStatus(item);
  return kind ? <DataStatusLabel kind={kind} date={item.cachedAt} locale={locale} /> : null;
}

/** For a member: this opportunity is in the company's own ranked matches. The judge's why is shown as stored. */
export function MatchNote({ match, locale = DEFAULT_LOCALE }: { match: MatchInfo; locale?: Locale }) {
  const t = createTranslator(locale, "explore");
  return (
    <p className="rounded-lg bg-muted px-3 py-2 text-sm break-words">
      <span className="font-medium">{t("match.note", { position: match.position })}</span>{" "}
      {match.why ?? <span className="text-muted-foreground">{t("match.notJudged")}</span>}
    </p>
  );
}

/** The external link to the source page. Long titles wrap, so a phone never scrolls sideways. */
export function SourceLink({ url, title, className, locale = DEFAULT_LOCALE }: { url: string; title: string; className?: string; locale?: Locale }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={`font-medium break-words underline-offset-4 hover:underline ${className ?? ""}`}>
      {title}
      <span className="sr-only">{createTranslator(locale, "common")("opensInNewTab")}</span>
    </a>
  );
}

/**
 * What a view shows when nothing is there: what is missing and what to do.
 * With a filter set, a link that clears them; without one, `empty` explains
 * that nothing of this kind is stored yet.
 */
export function NoResults({
  filters,
  filtered,
  empty,
  locale = DEFAULT_LOCALE,
}: {
  filters: ExploreFilters;
  filtered: string;
  empty: string;
  locale?: Locale;
}) {
  const active = hasActiveFilters(filters);
  return (
    <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
      <p>{active ? filtered : empty}</p>
      {active ? (
        <Link href={clearFiltersHref(filters)} className="font-medium text-primary underline-offset-4 hover:underline">
          {createTranslator(locale, "explore")("filters.clearAll")}
        </Link>
      ) : null}
    </div>
  );
}
