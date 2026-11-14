import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DATA_STATUS_KINDS,
  DATA_STATUS_META,
  DataStatusLabel,
  dataStatusFromVerdict,
  formatStatusDate,
  type DataStatusKind,
} from "@/components/data-status-label";
import type { SourceHealth } from "@/lib/sources/health";

/**
 * The data status panel (C13): every row of source_status with its verdict
 * from lib/sources/health.ts (judgeSources). Presentational: the caller reads
 * the rows (as the signed-in user) and judges them.
 */
export function DataStatusPanel({
  entries,
  title = "Data sources",
  description,
}: {
  entries: SourceHealth[];
  title?: string;
  description?: string;
}) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="text-heading">{title}</CardTitle>
        <CardDescription>{description ?? sourceSummary(entries)}</CardDescription>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="py-2 text-muted-foreground">
            No source has a status yet. Each collector writes one the first time it runs.
          </p>
        ) : (
          <ul className="flex flex-col divide-y">
            {entries.map((entry) => (
              <SourceRow key={entry.source} entry={entry} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function SourceRow({ entry }: { entry: SourceHealth }) {
  const kind = dataStatusFromVerdict(entry.verdict);
  const loaded = kind === "hand_entered" ? formatStatusDate(entry.lastSuccessAt) : null;
  return (
    <li
      data-source={entry.source}
      className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 md:grid md:grid-cols-[minmax(0,13rem)_minmax(0,15rem)_5.5rem_minmax(0,1fr)] md:items-baseline md:gap-4"
    >
      <div className="min-w-0">
        <p className="font-medium">{entry.label}</p>
        <p className="font-mono text-xs text-muted-foreground">{entry.source}</p>
      </div>
      <div>
        <DataStatusLabel kind={kind} date={statusDate(entry, kind)} />
      </div>
      <p className="text-sm text-muted-foreground tabular-nums">{itemCount(entry.itemCount)}</p>
      <p className="text-sm break-words text-muted-foreground">
        {[loaded ? `Loaded ${loaded}.` : null, entry.message].filter(Boolean).join(" ") || "—"}
      </p>
    </li>
  );
}

/** The date the label shows: the copy's date for cached sources, the last read for live ones. */
export function statusDate(entry: Pick<SourceHealth, "cachedAt" | "lastSuccessAt">, kind: DataStatusKind): Date | null {
  if (kind === "cached") return entry.cachedAt;
  if (kind === "live" || kind === "stale") return entry.lastSuccessAt;
  return null;
}

function itemCount(n: number | null): string {
  if (n === null) return "? items";
  return `${n.toLocaleString("en-GB")} ${n === 1 ? "item" : "items"}`;
}

/** "9 sources: 4 live, 2 cached copies, 3 hand-entered." */
export function sourceSummary(entries: Pick<SourceHealth, "verdict">[]): string {
  if (entries.length === 0) return "No sources yet.";
  const counts = new Map<DataStatusKind, number>();
  for (const e of entries) {
    const kind = dataStatusFromVerdict(e.verdict);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  const words: Record<DataStatusKind, (n: number) => string> = {
    live: () => "live",
    stale: () => "stale",
    cached: (n) => (n === 1 ? "cached copy" : "cached copies"),
    simulated: () => "simulated",
    hand_entered: () => "hand-entered",
  };
  const parts = DATA_STATUS_KINDS.filter((k) => counts.has(k)).map((k) => `${counts.get(k)} ${words[k](counts.get(k)!)}`);
  const total = `${entries.length} ${entries.length === 1 ? "source" : "sources"}`;
  return `${total}: ${parts.join(", ")}.`;
}

/** What each label means, for under the panel. */
export function DataStatusLegend({ kinds = ["live", "stale", "cached", "hand_entered", "simulated"] }: { kinds?: DataStatusKind[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      {kinds.map((kind) => (
        <div key={kind} className="flex flex-col items-start gap-1">
          <dt>
            <DataStatusLabel kind={kind} nameOnly />
          </dt>
          <dd className="text-muted-foreground">{DATA_STATUS_META[kind].description}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Placeholder while the rows load. */
export function DataStatusPanelSkeleton() {
  return (
    <Card aria-busy="true">
      <CardHeader className="border-b">
        <CardTitle className="text-heading">Data sources</CardTitle>
        <CardDescription>Loading the status of each source…</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
