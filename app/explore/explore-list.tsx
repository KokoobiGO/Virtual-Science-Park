import { Badge } from "@/components/ui/badge";
import { dateLabel, dateStatus, type ExploreFilters, type ExploreItem, type MatchInfo } from "@/lib/explore/filter";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { createTranslator } from "@/lib/i18n/translate";
import { ItemStatusLabel, MatchNote, NoResults, SourceLink } from "./opportunity-bits";
import { ScrollToRow } from "./scroll-to-row";
import { FIRST_ROWS } from "./list-size";
import { ShowMoreList } from "./show-more-list";

/** The list view: every opportunity that passes the filters, coming dates first. Words in the reader's language (C19); titles, sources and descriptions as stored. */
export function ExploreList({
  items,
  total,
  matches,
  filters,
  now,
  locale = DEFAULT_LOCALE,
}: {
  items: ExploreItem[];
  total: number;
  /** The member's ranked matches; null for staff, who see no personal column. */
  matches: Map<string, MatchInfo> | null;
  filters: ExploreFilters;
  now: Date;
  locale?: Locale;
}) {
  const t = createTranslator(locale, "explore");
  const shown = items.length;
  const matched = matches ? items.filter((item) => matches.has(item.id)).length : 0;
  const count =
    shown === total
      ? matches
        ? t("list.countAllMatched", { total, matched })
        : t("list.countAll", { total })
      : matches
        ? t("list.countSomeMatched", { shown, total, matched })
        : t("list.countSome", { shown, total });
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {count}
      </p>
      {items.length ? (
        <ShowMoreList
          className="stagger flex flex-col divide-y"
          showAllLabel={t("list.showAll", { count: shown })}
          showingLabel={t("list.showingFirst", { shown: Math.min(FIRST_ROWS, shown) })}
        >
          {items.map((item) => (
            <ExploreRow key={item.id} item={item} match={matches?.get(item.id) ?? null} now={now} locale={locale} />
          ))}
        </ShowMoreList>
      ) : (
        <NoResults filters={filters} filtered={t("list.emptyFiltered")} empty={t("list.empty")} locale={locale} />
      )}
      <ScrollToRow />
    </div>
  );
}

/** One opportunity as a plain row: the title, one quiet meta line (kind, labels, source, date), two lines of description and the member's match note. */
function ExploreRow({ item, match, now, locale }: { item: ExploreItem; match: MatchInfo | null; now: Date; locale: Locale }) {
  const t = createTranslator(locale, "explore");
  const tc = createTranslator(locale, "common");
  const status = dateStatus(item, now);
  return (
    // `target:` styles: "Show it in the list" on the map lands here with a plain link, so the row is :target and stays marked; <ScrollToRow> flashes it once.
    <li id={`opportunity-${item.id}`} className="-mx-3 flex scroll-mt-24 flex-col gap-1.5 rounded-lg px-3 py-4 transition-colors hover:bg-foreground/[0.025] target:flex! target:bg-primary/10 target:ring-1 target:ring-primary/40" data-kind={item.kind}>
      <SourceLink url={item.url} title={item.title} locale={locale} />
      {/* The kind stays a badge, so e2e/helpers.ts (checkHandEnteredLabels) finds this line, with its source, by its first badge. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <Badge variant="outline" className="text-muted-foreground">
          {tc(`kinds.${item.kind}`)}
        </Badge>
        <ItemStatusLabel item={item} locale={locale} />
        {status === "closing_soon" ? <Badge>{t("list.closingSoon")}</Badge> : null}
        {status === "closed" ? <Badge variant="outline">{t("list.closed")}</Badge> : null}
        <span className="break-words">{item.source}</span>
        <span aria-hidden>·</span>
        <span className={status === "closing_soon" ? "font-medium text-foreground" : undefined}>{dateLabel(item, now, locale)}</span>
      </div>
      {item.description ? <p className="line-clamp-2 text-sm break-words text-muted-foreground">{item.description}</p> : null}
      {match ? <MatchNote match={match} locale={locale} /> : null}
    </li>
  );
}
