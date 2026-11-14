import { cn } from "cn";
import { AlarmClock, ArrowRight, CalendarDays, CalendarX2, CircleHelp, Clock, ExternalLink, Hourglass, Sparkles, TrendingUp, type LucideIcon } from "lucide-react";
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

function Part({ heading, icon: Icon, children, className }: { heading: string; icon?: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <h4 className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {Icon ? <Icon aria-hidden className="size-3.5" /> : null}
        {heading}
      </h4>
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
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-start gap-1.5 break-words text-primary underline-offset-4 hover:underline"
            >
              <ExternalLink aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              <span>
                {sourceLabel(s)}
                <span className="sr-only">{newTab}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </Part>
  );
}

/** How each urgency looks. The words always say it too, so colour is never the only signal. */
function urgencyLook(kind: "deadline" | "event", urgency: Urgency): { variant: "muted" | "warning" | "info" | "outline"; icon: LucideIcon } {
  switch (urgency.level) {
    case "passed":
      return { variant: "muted", icon: CalendarX2 };
    case "today":
    case "tomorrow":
      return { variant: kind === "deadline" ? "warning" : "info", icon: AlarmClock };
    case "soon":
      return { variant: kind === "deadline" ? "warning" : "info", icon: Hourglass };
    default:
      return { variant: "outline", icon: Clock };
  }
}

/** "Deadline: 2 Dec 2026, 14:00" with "Closes in 18 days" beside it. */
function DateLine({ kind, at, now, locale }: { kind: "deadline" | "event"; at: Date; now: Date; locale: Locale }) {
  const t = createTranslator(locale, "week");
  const urgency = dateUrgency(at, now);
  const { variant, icon: Icon } = urgencyLook(kind, urgency);
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground" data-urgency={urgency.level}>
      <CalendarDays aria-hidden className="size-4 shrink-0" />
      <span>
        {t(kind === "deadline" ? "card.deadline" : "card.eventDate")}:{" "}
        <span className={cn("font-medium text-foreground", urgency.level === "passed" && "line-through decoration-muted-foreground/60")}>
          {formatWhen(at, locale)}
        </span>
      </span>
      <Badge variant={variant}>
        <Icon aria-hidden data-icon="inline-start" />
        {urgencyText(kind, urgency, locale)}
      </Badge>
    </div>
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

  return (
    <Card className="lift gap-0 py-0 has-data-[slot=card-footer]:pb-0">
      <CardHeader className="gap-2 pt-4 pb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {isTrend ? (
            <>
              <Badge variant="secondary">
                <TrendingUp aria-hidden data-icon="inline-start" />
                {t("card.trendNote")}
              </Badge>
              {area ? <Badge variant="outline">{area}</Badge> : null}
            </>
          ) : (
            <>
              <Badge>
                <Sparkles aria-hidden data-icon="inline-start" />
                {t("card.potentialMatch")}
              </Badge>
              {opportunity ? <Badge variant="secondary">{kindLabel(opportunity.kind, locale)}</Badge> : null}
              {opportunity ? <Badge variant="outline">{opportunity.source}</Badge> : null}
              {notOpen ? <Badge variant="warning">{notOpen}</Badge> : null}
              {status ? <DataStatusLabel kind={status} date={opportunity?.cachedAt} locale={locale} /> : null}
            </>
          )}
        </div>
        <CardTitle>
          <h3 className="text-lg leading-snug font-semibold text-balance">{card.title}</h3>
        </CardTitle>
        {opportunity?.deadline || opportunity?.eventDate ? (
          <div className="flex flex-col gap-1">
            {opportunity.deadline ? <DateLine kind="deadline" at={opportunity.deadline} now={now} locale={locale} /> : null}
            {opportunity.eventDate ? <DateLine kind="event" at={opportunity.eventDate} now={now} locale={locale} /> : null}
          </div>
        ) : null}
      </CardHeader>

      <CardContent className="flex flex-col gap-4 pb-4">
        <Part
          heading={t(isTrend ? "card.whatChanged" : "card.whyItFits")}
          className="rounded-lg border-l-4 border-primary/50 bg-primary/5 py-2 pr-3 pl-3"
        >
          <p className={cn("text-[0.95rem] leading-relaxed text-foreground", isTrend && "whitespace-pre-line")}>{card.why}</p>
        </Part>
        <Part heading={t("card.nextStep")} icon={ArrowRight}>
          <p className="leading-relaxed">{card.nextStep}</p>
        </Part>
        {card.uncertainties.length ? (
          <Part heading={t("card.uncertain")} icon={CircleHelp}>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              {card.uncertainties.map((u) => (
                <li key={u}>{u}</li>
              ))}
            </ul>
          </Part>
        ) : null}
        <Sources sources={card.sources} locale={locale} />
      </CardContent>

      {opportunity ? (
        <CardFooter>
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
