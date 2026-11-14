import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { formatDay, monthLabel, shortMonthLabel } from "@/lib/explore/dates";
import { dateStatus, type ExploreItem, type MatchInfo } from "@/lib/explore/filter";
import { monthCounts, type MonthGroup, type Timeline } from "@/lib/explore/timeline";
import { SimulatedBadge, SourceLink } from "./opportunity-bits";

/** The second view (C16): call deadlines by month, then dated events. No map. */
export function ExploreTimeline({ timeline, matches, now }: { timeline: Timeline; matches: Map<string, MatchInfo> | null; now: Date }) {
  const callCount = timeline.calls.reduce((sum, g) => sum + g.items.length, 0);
  const eventCount = timeline.events.reduce((sum, g) => sum + g.items.length, 0);
  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4" aria-labelledby="calls-heading">
        <div className="flex flex-col gap-1">
          <h2 id="calls-heading" className="text-lg font-semibold">
            Funding call deadlines
          </h2>
          <p className="text-sm text-muted-foreground">
            {callCount} funding calls whose deadline has not passed, by the month of the deadline. Calls that open later say
            so. Click a month to jump to its calls.
          </p>
        </div>
        <MonthBars groups={timeline.calls} />
        {timeline.calls.map((group) => (
          <MonthSection key={group.key} group={group} idPrefix="calls" noun="call">
            {group.items.map((item) => (
              <TimelineRow key={item.id} item={item} date={item.deadline!} match={matches?.get(item.id) ?? null} now={now} />
            ))}
          </MonthSection>
        ))}
        {callCount ? null : <p className="rounded-xl border p-6 text-sm text-muted-foreground">No open funding call fits these filters.</p>}
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="events-heading">
        <div className="flex flex-col gap-1">
          <h2 id="events-heading" className="text-lg font-semibold">
            Events
          </h2>
          <p className="text-sm text-muted-foreground">
            {eventCount} dated {eventCount === 1 ? "event" : "events"} from today on, by date.
            {timeline.undatedEvents.length
              ? ` ${timeline.undatedEvents.length} recurring ${timeline.undatedEvents.length === 1 ? "series has" : "series have"} no stored date and ${timeline.undatedEvents.length === 1 ? "is" : "are"} listed after them.`
              : ""}
          </p>
        </div>
        {timeline.events.map((group) => (
          <MonthSection key={group.key} group={group} idPrefix="events" noun="event">
            {group.items.map((item) => (
              <TimelineRow key={item.id} item={item} date={item.eventDate!} match={matches?.get(item.id) ?? null} now={now} />
            ))}
          </MonthSection>
        ))}
        {eventCount ? null : <p className="rounded-xl border p-6 text-sm text-muted-foreground">No dated event ahead fits these filters.</p>}
        {timeline.undatedEvents.length ? (
          <div className="flex flex-col gap-2">
            <h3 className="font-medium">Recurring, no date stored</h3>
            <ul className="divide-y rounded-xl border">
              {timeline.undatedEvents.map((item) => (
                <li key={item.id} className="flex flex-col gap-1 px-4 py-2.5">
                  <SourceLink url={item.url} title={item.title} className="text-sm" />
                  <ItemMeta item={item} match={matches?.get(item.id) ?? null} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </div>
  );
}

/** One bar per month, so the busy months stand out. Each bar links to its month. */
function MonthBars({ groups }: { groups: MonthGroup<ExploreItem>[] }) {
  const counts = monthCounts(groups);
  if (!counts.length) return null;
  const max = Math.max(...counts.map((c) => c.count));
  return (
    <div className="overflow-x-auto rounded-xl border p-4">
      <ol className="flex min-w-max items-end gap-1.5" aria-label="Deadlines per month">
        {counts.map((c, i) => {
          const [year, month] = c.key.split("-");
          const label = `${monthLabel(c.key)}: ${c.count} ${c.count === 1 ? "deadline" : "deadlines"}`;
          return (
            <li key={c.key} className="flex w-9 flex-col items-center gap-1">
              <span className="text-xs tabular-nums text-muted-foreground">{c.count || ""}</span>
              <div className="flex h-28 w-full items-end justify-center">
                {c.count ? (
                  <a
                    href={`#calls-${c.key}`}
                    title={label}
                    aria-label={label}
                    className="block w-6 rounded-t-md bg-primary hover:bg-primary/80"
                    style={{ height: `${Math.max(6, (c.count / max) * 100)}%` }}
                  />
                ) : (
                  <span className="block h-px w-6 bg-border" aria-label={label} />
                )}
              </div>
              <span className="text-xs">{shortMonthLabel(c.key)}</span>
              <span className="h-4 text-xs text-muted-foreground">{i === 0 || month === "01" ? year : ""}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function MonthSection({ group, idPrefix, noun, children }: { group: MonthGroup<ExploreItem>; idPrefix: string; noun: string; children: ReactNode }) {
  return (
    <div id={`${idPrefix}-${group.key}`} className="flex scroll-mt-24 flex-col gap-2">
      <h3 className="font-medium">
        {group.label}{" "}
        <span className="font-normal text-muted-foreground">
          ({group.items.length} {group.items.length === 1 ? noun : `${noun}s`})
        </span>
      </h3>
      <ul className="divide-y rounded-xl border">{children}</ul>
    </div>
  );
}

function TimelineRow({ item, date, match, now }: { item: ExploreItem; date: Date; match: MatchInfo | null; now: Date }) {
  const status = dateStatus(item, now);
  return (
    <li className="flex gap-4 px-4 py-2.5">
      <span className={`w-24 shrink-0 text-sm tabular-nums ${status === "closing_soon" ? "font-medium" : "text-muted-foreground"}`}>
        {formatDay(date)}
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <SourceLink url={item.url} title={item.title} className="text-sm" />
        <ItemMeta item={item} match={match} />
        {status === "opens_later" && item.opensAt ? (
          <span className="text-xs text-muted-foreground">Not open yet: opens {formatDay(item.opensAt)}.</span>
        ) : null}
      </div>
    </li>
  );
}

function ItemMeta({ item, match }: { item: ExploreItem; match: MatchInfo | null }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span>{item.source}</span>
      {item.simulated ? <SimulatedBadge /> : null}
      {match ? (
        <Badge variant="secondary" title={match.why ?? "Not judged yet."}>
          Your potential match, number {match.position}
        </Badge>
      ) : null}
    </div>
  );
}
