import { cn } from "cn";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { DataStatusLabel, itemDataStatus } from "@/components/data-status-label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { createTranslator, MESSAGES } from "@/lib/i18n/translate";
import { calendarHref, dateUrgency, formatWhen, isWebLink, kindLabel, notOpenYetLabel, sourceLabel, urgencyText, type Urgency } from "@/lib/week/format";
import type { WeekCardView } from "@/lib/week/load";
import { CardActions } from "./card-actions";

type AreaKey = keyof (typeof MESSAGES)["en"]["week"]["areas"];

function areaLabel(area: string, locale: Locale): string {
  const areas = MESSAGES[locale].week.areas;
  return area in areas ? areas[area as AreaKey] : area;
}

function Part({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{heading}</h4>
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

/** "Deadline: 2 Dec 2026, 14:00 · Closes in 18 days", as part of the card's quiet line. */
function DateText({ kind, at, now, locale }: { kind: "deadline" | "event"; at: Date; now: Date; locale: Locale }) {
  const t = createTranslator(locale, "week");
  const urgency = dateUrgency(at, now);
  return (
    <span data-urgency={urgency.level}>
      {t(kind === "deadline" ? "card.deadline" : "card.eventDate")}:{" "}
      <span className={cn("text-foreground", urgency.level === "passed" && "line-through decoration-muted-foreground/60")}>{formatWhen(at, locale)}</span>
      <span aria-hidden> &middot; </span>
      <span className={urgencyClass(kind, urgency)}>{urgencyText(kind, urgency, locale)}</span>
    </span>
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

  // Kind, source and dates on one quiet line.
  const meta: ReactNode[] = [];
  if (isTrend && area) meta.push(<span key="area">{area}</span>);
  if (opportunity) {
    meta.push(<span key="kind">{kindLabel(opportunity.kind, locale)}</span>);
    meta.push(<span key="source">{opportunity.source}</span>);
    if (opportunity.deadline) meta.push(<DateText key="deadline" kind="deadline" at={opportunity.deadline} now={now} locale={locale} />);
    if (opportunity.eventDate) meta.push(<DateText key="event" kind="event" at={opportunity.eventDate} now={now} locale={locale} />);
  }
  const hasDetails = card.uncertainties.length > 0 || card.sources.some((s) => isWebLink(s.url));

  return (
    <Card className="gap-0 py-0 has-data-[slot=card-footer]:pb-0">
      <CardHeader className="gap-2 pt-5 pb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {isTrend ? (
            <Badge variant="secondary">{t("card.trendNote")}</Badge>
          ) : (
            <>
              <Badge>{t("card.potentialMatch")}</Badge>
              {notOpen ? <Badge variant="warning">{notOpen}</Badge> : null}
              {status ? <DataStatusLabel kind={status} date={opportunity?.cachedAt} locale={locale} /> : null}
            </>
          )}
        </div>
        <CardTitle>
          <h3 className="text-lg leading-snug font-semibold text-balance">{card.title}</h3>
        </CardTitle>
        {meta.length ? (
          <p className="flex flex-wrap gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
            {meta.map((item, i) => (
              <span key={i} className="inline-flex gap-x-2">
                {i > 0 ? <span aria-hidden>&middot;</span> : null}
                {item}
              </span>
            ))}
          </p>
        ) : null}
      </CardHeader>

      <CardContent className="flex flex-col gap-4 pb-4">
        <Part heading={t(isTrend ? "card.whatChanged" : "card.whyItFits")}>
          <p className={cn("leading-relaxed", isTrend && "whitespace-pre-line")}>{card.why}</p>
        </Part>
        <Part heading={t("card.nextStep")}>
          <p className="leading-relaxed">{card.nextStep}</p>
        </Part>
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
        <CardFooter className="border-t-0 bg-transparent pt-0">
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
