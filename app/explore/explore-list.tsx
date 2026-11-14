import { Badge } from "@/components/ui/badge";
import { dateLabel, dateStatus, type ExploreFilters, type ExploreItem, type MatchInfo } from "@/lib/explore/filter";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { createTranslator } from "@/lib/i18n/translate";
import { tagChip } from "./labels";
import { ItemStatusLabel, MatchNote, NoResults, SourceLink } from "./opportunity-bits";

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
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {count}
      </p>
      {items.length ? (
        <ul className="divide-y rounded-xl border">
          {items.map((item) => (
            <ExploreRow key={item.id} item={item} match={matches?.get(item.id) ?? null} now={now} locale={locale} />
          ))}
        </ul>
      ) : (
        <NoResults filters={filters} filtered={t("list.emptyFiltered")} empty={t("list.empty")} locale={locale} />
      )}
    </div>
  );
}

function ExploreRow({ item, match, now, locale }: { item: ExploreItem; match: MatchInfo | null; now: Date; locale: Locale }) {
  const t = createTranslator(locale, "explore");
  const tc = createTranslator(locale, "common");
  const status = dateStatus(item, now);
  return (
    <li id={`opportunity-${item.id}`} className="flex scroll-mt-24 flex-col gap-2 px-4 py-3 target:bg-muted" data-kind={item.kind}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="secondary">{tc(`kinds.${item.kind}`)}</Badge>
        <ItemStatusLabel item={item} locale={locale} />
        {status === "closing_soon" ? <Badge>{t("list.closingSoon")}</Badge> : null}
        {status === "closed" ? <Badge variant="outline">{t("list.closed")}</Badge> : null}
        <span className="break-words text-muted-foreground">{item.source}</span>
        <span aria-hidden className="text-muted-foreground">
          ·
        </span>
        <span className={status === "closing_soon" ? "font-medium" : "text-muted-foreground"}>{dateLabel(item, now, locale)}</span>
      </div>
      <SourceLink url={item.url} title={item.title} locale={locale} />
      {item.description ? <p className="line-clamp-2 text-sm break-words text-muted-foreground">{item.description}</p> : null}
      {item.tags.length ? (
        <p className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
          <span className="sr-only">{t("list.tags")}</span>
          {item.tags.map((tag) => (
            <span key={tag} className="rounded-md border px-1.5 py-0.5">
              {tagChip(tag, locale)}
            </span>
          ))}
        </p>
      ) : null}
      {match ? <MatchNote match={match} locale={locale} /> : null}
    </li>
  );
}
