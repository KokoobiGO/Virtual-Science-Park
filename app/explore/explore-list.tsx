import { Badge } from "@/components/ui/badge";
import { dateLabel, dateStatus, KIND_LABELS, type ExploreItem, type MatchInfo } from "@/lib/explore/filter";
import { MatchNote, SimulatedBadge, SourceLink } from "./opportunity-bits";

/** The list view: every opportunity that passes the filters, coming dates first. */
export function ExploreList({
  items,
  total,
  matches,
  now,
}: {
  items: ExploreItem[];
  total: number;
  /** The member's ranked matches; null for staff, who see no personal column. */
  matches: Map<string, MatchInfo> | null;
  now: Date;
}) {
  const matched = matches ? items.filter((item) => matches.has(item.id)).length : 0;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {items.length === total ? `All ${total} opportunities` : `${items.length} of ${total} opportunities`}
        {matches ? `, ${matched} of them in your ranked matches` : ""}.
      </p>
      {items.length ? (
        <ul className="divide-y rounded-xl border">
          {items.map((item) => (
            <ExploreRow key={item.id} item={item} match={matches?.get(item.id) ?? null} now={now} />
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border p-6 text-sm text-muted-foreground">No opportunity fits these filters.</p>
      )}
    </div>
  );
}

function ExploreRow({ item, match, now }: { item: ExploreItem; match: MatchInfo | null; now: Date }) {
  const status = dateStatus(item, now);
  return (
    <li id={`opportunity-${item.id}`} className="flex scroll-mt-24 flex-col gap-2 px-4 py-3 target:bg-muted" data-kind={item.kind}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="secondary">{KIND_LABELS[item.kind]}</Badge>
        {item.simulated ? <SimulatedBadge /> : null}
        {status === "closing_soon" ? <Badge>Closing soon</Badge> : null}
        {status === "closed" ? <Badge variant="outline">Closed</Badge> : null}
        <span className="text-muted-foreground">{item.source}</span>
        <span aria-hidden className="text-muted-foreground">
          ·
        </span>
        <span className={status === "closing_soon" ? "font-medium" : "text-muted-foreground"}>{dateLabel(item, now)}</span>
      </div>
      <SourceLink url={item.url} title={item.title} />
      {item.description ? <p className="line-clamp-2 text-sm text-muted-foreground">{item.description}</p> : null}
      {item.tags.length ? (
        <p className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
          <span className="sr-only">Tags:</span>
          {item.tags.map((tag) => (
            <span key={tag} className="rounded-md border px-1.5 py-0.5">
              {tag}
            </span>
          ))}
        </p>
      ) : null}
      {match ? <MatchNote match={match} /> : null}
    </li>
  );
}
