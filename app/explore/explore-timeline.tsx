import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { monthLabel, shortMonthLabel } from "@/lib/explore/dates";
import { dateStatus, type ExploreFilters, type ExploreItem, type MatchInfo } from "@/lib/explore/filter";
import { monthCounts, type MonthGroup, type Timeline } from "@/lib/explore/timeline";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { formatDay } from "@/lib/i18n/format";
import { createTranslator, type Translator } from "@/lib/i18n/translate";
import { ItemStatusLabel, NoResults, SourceLink } from "./opportunity-bits";

type T = Translator<"explore">;

/** The second view (C16): call deadlines by month, then dated events. No map. Words and month names in the reader's language (C19). */
export function ExploreTimeline({
  timeline,
  matches,
  filters,
  now,
  locale = DEFAULT_LOCALE,
}: {
  timeline: Timeline;
  matches: Map<string, MatchInfo> | null;
  filters: ExploreFilters;
  now: Date;
  locale?: Locale;
}) {
  const t = createTranslator(locale, "explore");
  const callCount = timeline.calls.reduce((sum, g) => sum + g.items.length, 0);
  const eventCount = timeline.events.reduce((sum, g) => sum + g.items.length, 0);
  const undated = timeline.undatedEvents.length;
  return (
    <div className="flex flex-col gap-12">
      <section className="flex flex-col gap-4" aria-labelledby="calls-heading">
        <h2 id="calls-heading" className="text-heading">
          {t("timeline.callsTitle")}
        </h2>
        <MonthBars groups={timeline.calls} t={t} />
        {timeline.calls.map((group) => (
          <MonthSection key={group.key} group={group} idPrefix="calls" t={t}>
            {group.items.map((item) => (
              <TimelineRow key={item.id} item={item} date={item.deadline!} match={matches?.get(item.id) ?? null} now={now} t={t} />
            ))}
          </MonthSection>
        ))}
        {callCount ? null : (
          <NoResults filters={filters} filtered={t("timeline.callsEmptyFiltered")} empty={t("timeline.callsEmpty")} locale={locale} />
        )}
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="events-heading">
        <h2 id="events-heading" className="text-heading">
          {t("timeline.eventsTitle")}
        </h2>
        {timeline.events.map((group) => (
          <MonthSection key={group.key} group={group} idPrefix="events" t={t}>
            {group.items.map((item) => (
              <TimelineRow key={item.id} item={item} date={item.eventDate!} match={matches?.get(item.id) ?? null} now={now} t={t} />
            ))}
          </MonthSection>
        ))}
        {eventCount ? null : (
          <NoResults filters={filters} filtered={t("timeline.eventsEmptyFiltered")} empty={t("timeline.eventsEmpty")} locale={locale} />
        )}
        {undated ? (
          <div className="flex flex-col gap-2">
            <h3 className="font-medium">{t("timeline.undatedTitle")}</h3>
            <ul className="divide-y">
              {timeline.undatedEvents.map((item) => (
                <li key={item.id} className="flex flex-col gap-1 py-2.5">
                  <SourceLink url={item.url} title={item.title} className="text-sm" locale={locale} />
                  <ItemMeta item={item} match={matches?.get(item.id) ?? null} t={t} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </div>
  );
}

/** One bar per month, so the busy months stand out. Each bar links to its month; the count is written above it. */
function MonthBars({ groups, t }: { groups: MonthGroup<ExploreItem>[]; t: T }) {
  const counts = monthCounts(groups);
  if (!counts.length) return null;
  const max = Math.max(...counts.map((c) => c.count));
  return (
    // `relative`, so the screen-reader-only month labels (absolutely placed) stay inside the scrolling box on a phone.
    <div className="relative overflow-x-auto py-2">
      <ol className="stagger flex min-w-max items-end gap-1.5" aria-label={t("timeline.barsLabel")}>
        {counts.map((c, i) => {
          const [year, month] = c.key.split("-");
          const label = t("timeline.bar", { month: monthLabel(c.key, t.locale), count: c.count });
          return (
            <li key={c.key} className="flex w-9 flex-col items-center gap-1">
              <span aria-hidden className="text-xs tabular-nums text-muted-foreground">
                {c.count || ""}
              </span>
              <div className="flex h-28 w-full items-end justify-center">
                {c.count ? (
                  <a
                    href={`#calls-${c.key}`}
                    title={label}
                    aria-label={label}
                    className="block w-6 rounded-t-md bg-primary transition-colors hover:bg-primary/75 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                    style={{ height: `${Math.max(6, (c.count / max) * 100)}%` }}
                  />
                ) : (
                  <>
                    <span aria-hidden className="block h-px w-6 bg-border" />
                    <span className="sr-only">{label}</span>
                  </>
                )}
              </div>
              <span aria-hidden className="text-xs">
                {shortMonthLabel(c.key, t.locale)}
              </span>
              <span aria-hidden className="h-4 text-xs text-muted-foreground">
                {i === 0 || month === "01" ? year : ""}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function MonthSection({ group, idPrefix, t, children }: { group: MonthGroup<ExploreItem>; idPrefix: "calls" | "events"; t: T; children: ReactNode }) {
  const count = group.items.length;
  return (
    <div id={`${idPrefix}-${group.key}`} className="flex scroll-mt-24 flex-col gap-1 target:animate-pop">
      <h3 className="border-b pb-2 font-medium">
        {monthLabel(group.key, t.locale)}{" "}
        <span className="font-normal text-muted-foreground">({t(idPrefix === "calls" ? "timeline.monthCalls" : "timeline.monthEvents", { count })})</span>
      </h3>
      <ul className="stagger divide-y">{children}</ul>
    </div>
  );
}

function TimelineRow({ item, date, match, now, t }: { item: ExploreItem; date: Date; match: MatchInfo | null; now: Date; t: T }) {
  const status = dateStatus(item, now);
  return (
    <li className="flex gap-3 py-2.5 sm:gap-4">
      <span className={`w-24 shrink-0 text-sm tabular-nums ${status === "closing_soon" ? "font-medium" : "text-muted-foreground"}`}>
        {formatDay(date, t.locale)}
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <SourceLink url={item.url} title={item.title} className="text-sm" locale={t.locale} />
        <ItemMeta item={item} match={match} closingSoon={status === "closing_soon"} t={t} />
        {status === "opens_later" && item.opensAt ? (
          <span className="text-xs text-muted-foreground">{t("timeline.notOpenYet", { day: formatDay(item.opensAt, t.locale) })}</span>
        ) : null}
      </div>
    </li>
  );
}

function ItemMeta({ item, match, closingSoon = false, t }: { item: ExploreItem; match: MatchInfo | null; closingSoon?: boolean; t: T }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      {closingSoon ? <Badge>{t("list.closingSoon")}</Badge> : null}
      <span className="break-words">{item.source}</span>
      <ItemStatusLabel item={item} locale={t.locale} />
      {match ? (
        <Badge variant="secondary" title={match.why ?? t("match.badgeNotJudged")}>
          {t("match.badge", { position: match.position })}
        </Badge>
      ) : null}
    </div>
  );
}
