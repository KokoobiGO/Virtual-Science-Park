import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { calendarHref, cardDates, isWebLink, kindLabel, sourceLabel } from "@/lib/week/format";
import type { WeekCardView } from "@/lib/week/load";
import { CardActions } from "./card-actions";

const AREA_LABELS: Record<string, string> = {
  marine: "Marine",
  defence: "Defence",
  sensor: "Sensors",
  cyber: "Cyber security",
  ai: "AI",
  energy: "Energy",
};

function Part({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{heading}</h4>
      {children}
    </div>
  );
}

function Sources({ sources }: { sources: WeekCardView["sources"] }) {
  const links = sources.filter((s) => isWebLink(s.url));
  if (!links.length) return null;
  return (
    <Part heading={links.length === 1 ? "Source" : "Sources"}>
      <ul className="flex flex-col gap-1">
        {links.map((s) => (
          <li key={s.url}>
            <a href={s.url} target="_blank" rel="noopener noreferrer" className="break-words text-primary underline-offset-4 hover:underline">
              {sourceLabel(s)}
            </a>
          </li>
        ))}
      </ul>
    </Part>
  );
}

/** One card on the Your-week screen: a match with its buttons, or a trend note. */
export function WeekCard({ card, now }: { card: WeekCardView; now: Date }) {
  const opportunity = card.kind === "match" ? card.opportunity : null;
  const dates = opportunity ? cardDates(opportunity, now) : [];
  const area = card.trendArea ? (AREA_LABELS[card.trendArea] ?? card.trendArea) : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-1.5">
          {card.kind === "trend" ? (
            <>
              <Badge variant="secondary">Trend note</Badge>
              {area ? <Badge variant="outline">{area}</Badge> : null}
            </>
          ) : (
            <>
              <Badge>Potential match</Badge>
              {opportunity ? <Badge variant="secondary">{kindLabel(opportunity.kind)}</Badge> : null}
              {opportunity ? <Badge variant="outline">{opportunity.source}</Badge> : null}
              {opportunity?.simulated ? (
                <Badge variant="outline" className="border-dashed" title="Entered by hand by the team, not read from a live source">
                  Simulated data
                </Badge>
              ) : null}
            </>
          )}
        </div>
        <CardTitle>
          <h3 className="text-base font-semibold">{card.title}</h3>
        </CardTitle>
        {dates.length ? (
          <CardDescription>
            {dates.map((d) => (
              <span key={d.label} className="mr-4 inline-block">
                {d.label}: <span className="font-medium text-foreground">{d.text}</span>
                {d.passed ? " (passed)" : null}
              </span>
            ))}
          </CardDescription>
        ) : null}
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {card.kind === "trend" ? (
          <Part heading="What changed this week">
            <p className="whitespace-pre-line">{card.why}</p>
          </Part>
        ) : (
          <Part heading="Why it fits">
            <p>{card.why}</p>
          </Part>
        )}
        <Part heading="Next step">
          <p>{card.nextStep}</p>
        </Part>
        {card.uncertainties.length ? (
          <Part heading="What is uncertain">
            <ul className="list-disc space-y-1 pl-5">
              {card.uncertainties.map((u) => (
                <li key={u}>{u}</li>
              ))}
            </ul>
          </Part>
        ) : null}
        <Sources sources={card.sources} />
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
