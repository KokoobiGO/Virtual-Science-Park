import { cn } from "cn";
import { ArrowRight, CalendarDays, ChevronRight, Clock } from "lucide-react";
import type { ReactNode } from "react";
import { DataStatusLabel, itemDataStatus } from "@/components/data-status-label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { createTranslator, MESSAGES } from "@/lib/i18n/translate";
import { calendarHref, dateUrgency, formatWhen, isWebLink, kindLabel, notOpenYetLabel, sourceLabel, urgencyText, type Urgency } from "@/lib/week/format";
import type { WeekCardView } from "@/lib/week/load";
import { CardActions } from "./card-actions";
import { KindIcon, type CardKind } from "./kind-icon";

type AreaKey = keyof (typeof MESSAGES)["en"]["week"]["areas"];

function areaLabel(area: string, locale: Locale): string {
  const areas = MESSAGES[locale].week.areas;
  return area in areas ? areas[area as AreaKey] : area;
}

function Part({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <h4 className="text-xs font-semibold text-muted-foreground">{heading}</h4>
      {children}
    </div>
  );
}

function Sources({ sources, locale }: { sources: WeekCardView["sources"]; locale: Locale }) {
  const t = createTranslator(locale, "week");
  const links = sources.filter((s) => isWebLink(s.url));
  if (!links.length) return null;
  const newTab = MESSAGES[locale].common.opensInNewTab;
  return (
    <Part heading={t(links.length === 1 ? "card.source" : "card.sources")}>
      <ul className="flex flex-col gap-1">
        {links.map((s) => (
          <li key={s.url}>
            <a href={s.url} target="_blank" rel="noopener noreferrer" className="break-words underline underline-offset-4 hover:text-foreground">
              {sourceLabel(s)}
              <span className="sr-only">{newTab}</span>
            </a>
          </li>
        ))}
      </ul>
    </Part>
  );
}

/** The colour of the urgency words. The words always say it too, so colour is never the only signal. */
function urgencyClass(kind: "deadline" | "event", urgency: Urgency): string | undefined {
  switch (urgency.level) {
    case "today":
    case "tomorrow":
    case "soon":
      return kind === "deadline" ? "text-warning" : "text-info";
    default:
      return undefined;
  }
}

/** "Deadline 2 Dec 2026, 14:00 · Closes in 18 days", on its own line under the title. */
function DateText({ kind, at, now, locale }: { kind: "deadline" | "event"; at: Date; now: Date; locale: Locale }) {
  const t = createTranslator(locale, "week");
  const urgency = dateUrgency(at, now);
  const Icon = kind === "deadline" ? Clock : CalendarDays;
  return (
    <p data-urgency={urgency.level} className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-muted-foreground">
      <Icon aria-hidden className="size-3.5 shrink-0" />
      <span>{t(kind === "deadline" ? "card.deadline" : "card.eventDate")}:</span>
      <span className={cn("text-foreground", urgency.level === "passed" && "line-through decoration-muted-foreground/60")}>{formatWhen(at, locale)}</span>
      <span aria-hidden>&middot;</span>
      <span className={cn("font-medium", urgencyClass(kind, urgency))}>{urgencyText(kind, urgency, locale)}</span>
    </p>
  );
}

/** One card on the Your-week screen: a match with its buttons, or a trend note. */
export function WeekCard({ card, now, locale = DEFAULT_LOCALE }: { card: WeekCardView; now: Date; locale?: Locale }) {
  const t = createTranslator(locale, "week");
  const opportunity = card.kind === "match" ? card.opportunity : null;
  const notOpen = opportunity ? notOpenYetLabel(opportunity.opensAt, now, locale) : null;
  // D20: hand-entered, simulated or cached data is always labelled; nothing for an item read live.
  const status = opportunity ? itemDataStatus(opportunity) : null;
  const area = card.trendArea ? areaLabel(card.trendArea, locale) : null;
  const isTrend = card.kind === "trend";
  const kind: CardKind = isTrend ? "trend" : (opportunity?.kind ?? "news");

  // The label first, then kind and source, on one quiet line. The first badge
  // and the source share a parent: e2e/helpers.ts (checkHandEnteredLabels) reads it so.
  const meta: ReactNode[] = [];
  if (isTrend && area) meta.push(<span key="area">{area}</span>);
  if (opportunity) {
    meta.push(<span key="kind">{kindLabel(opportunity.kind, locale)}</span>);
    meta.push(<span key="source">{opportunity.source}</span>);
  }
  const hasDetails = card.uncertainties.length > 0 || card.sources.some((s) => isWebLink(s.url));

  return (
    <Card className="gap-0 py-0 has-data-[slot=card-footer]:pb-0">
      <CardHeader className="flex gap-3.5 pt-5 pb-4">
        <KindIcon kind={kind} className="mt-0.5 max-sm:hidden" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {isTrend ? (
              <Badge variant="secondary">{t("card.trendNote")}</Badge>
            ) : (
              <Badge variant="outline" className="text-foreground">
                {t("card.potentialMatch")}
              </Badge>
            )}
            {meta.map((item, i) => (
              <span key={i} className="inline-flex gap-x-2">
                {i > 0 ? <span aria-hidden>&middot;</span> : null}
                {item}
              </span>
            ))}
            {notOpen ? <Badge variant="warning">{notOpen}</Badge> : null}
            {status ? <DataStatusLabel kind={status} date={opportunity?.cachedAt} locale={locale} /> : null}
          </div>
          <CardTitle>
            <h3 className="text-lg leading-snug font-semibold text-balance">{card.title}</h3>
          </CardTitle>
          {opportunity?.deadline ? <DateText kind="deadline" at={opportunity.deadline} now={now} locale={locale} /> : null}
          {opportunity?.eventDate ? <DateText kind="event" at={opportunity.eventDate} now={now} locale={locale} /> : null}
        </div>
      </CardHeader>

      <CardContent className="flex min-w-0 flex-col gap-4 pb-5 sm:pl-[4.375rem]">
        <Part heading={t(isTrend ? "card.whatChanged" : "card.whyItFits")}>
          <p className={cn("leading-relaxed break-words text-foreground/90", isTrend && "whitespace-pre-line")}>{card.why}</p>
        </Part>
        {/* The one thing to do, set apart so it is found at a glance. */}
        <div className="flex gap-2.5 rounded-xl bg-muted/70 px-3.5 py-3 ring-1 ring-foreground/5">
          <ArrowRight aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" />
          <Part heading={t("card.nextStep")}>
            <p className="leading-relaxed wrap-anywhere">{card.nextStep}</p>
          </Part>
        </div>
        {hasDetails ? (
          <details className="group text-sm text-muted-foreground">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-md select-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&::-webkit-details-marker]:hidden">
              <ChevronRight aria-hidden className="size-4 transition-transform group-open:rotate-90" />
              {t("card.details")}
            </summary>
            <div className="flex animate-slide-down flex-col gap-4 pt-3 pl-5">
              {card.uncertainties.length ? (
                <Part heading={t("card.uncertain")}>
                  <ul className="list-disc space-y-1 pl-5">
                    {card.uncertainties.map((u) => (
                      <li key={u}>{u}</li>
                    ))}
                  </ul>
                </Part>
              ) : null}
              <Sources sources={card.sources} locale={locale} />
            </div>
          </details>
        ) : null}
      </CardContent>

      {opportunity ? (
        <CardFooter className="border-t border-foreground/[0.06] bg-foreground/[0.015] px-5 py-3">
          <CardActions
            opportunityId={opportunity.id}
            title={card.title}
            sourceUrl={isWebLink(opportunity.url) ? opportunity.url : null}
            calendarHref={opportunity.deadline || opportunity.eventDate ? calendarHref(opportunity.id) : null}
            initial={{ saved: card.saved, feedback: card.feedback, askedBsp: card.askedBsp }}
          />
        </CardFooter>
      ) : null}
    </Card>
  );
}
