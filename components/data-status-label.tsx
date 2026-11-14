import { cn } from "cn";
import { Archive, ClockFading, FlaskConical, PenLine, Radio, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { SourceState } from "@/lib/schemas";
import type { SourceVerdict } from "@/lib/sources/health";

/**
 * Where a piece of data comes from (C1, C13). The product rule: simulated or
 * cached data is always labelled.
 *
 * - live: read from the source; `date` is the last successful read.
 * - stale: a live source with no successful read for more than 48 hours.
 * - cached: a recorded copy is shown; `date` is the date of the copy.
 * - simulated: sample data the team wrote. Not real.
 * - hand_entered: the team typed it in from the source, so nothing reads it automatically.
 */
export type DataStatusKind = "live" | "stale" | "cached" | "simulated" | "hand_entered";

type DataStatusMeta = {
  label: string;
  description: string;
  variant: "success" | "warning" | "info" | "simulated";
  icon: LucideIcon;
};

export const DATA_STATUS_META: Record<DataStatusKind, DataStatusMeta> = {
  live: { label: "Live", description: "Read from the source itself.", variant: "success", icon: Radio },
  stale: {
    label: "Stale",
    description: "A live source that has not been read for more than 48 hours.",
    variant: "warning",
    icon: ClockFading,
  },
  cached: {
    label: "Cached copy",
    description: "A recorded copy of the source, from the date shown.",
    variant: "info",
    icon: Archive,
  },
  simulated: {
    label: "Simulated",
    description: "Sample data written by the team. Not real.",
    variant: "simulated",
    icon: FlaskConical,
  },
  hand_entered: {
    label: "Hand-entered",
    description: "Typed in by the team from the source, not read automatically.",
    variant: "simulated",
    icon: PenLine,
  },
};

export const DATA_STATUS_KINDS = Object.keys(DATA_STATUS_META) as DataStatusKind[];

/** From the health verdict in lib/sources/health.ts. */
export function dataStatusFromVerdict(verdict: SourceVerdict): DataStatusKind {
  return verdict === "ok" ? "live" : verdict;
}

/** From a row's stored state (source_status.state), without the 48-hour rule. */
export function dataStatusFromState(state: SourceState): DataStatusKind {
  return state;
}

/** External ids of the team's old sample opportunities (lib/matcher/score.ts, FIXTURE_PREFIX). */
const SAMPLE_PREFIX = "fixture-";

/**
 * The label one opportunity carries (D20), or null for an item read live.
 *
 * - `simulated` on an opportunity means a hand-entered source (lib/collectors/store.ts),
 *   except the team's sample fixtures, which are simulated.
 * - An item from a source whose state is "cached" came from the recorded copy:
 *   pass the source's `cachedAt` (or the item's retrievedAt) as the label's date.
 */
export function itemDataStatus(item: {
  simulated: boolean;
  externalId?: string | null;
  sourceState?: SourceState | null;
}): DataStatusKind | null {
  if (item.simulated) return item.externalId?.startsWith(SAMPLE_PREFIX) ? "simulated" : "hand_entered";
  if (item.sourceState === "cached") return "cached";
  if (item.sourceState === "simulated") return "hand_entered";
  return null;
}

const dayFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Europe/Stockholm",
});

/** "14 Nov 2026" in Swedish time, or null for no or an unreadable date. */
export function formatStatusDate(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  return Number.isNaN(d.getTime()) ? null : dayFormat.format(d);
}

/** The words on the label, e.g. "Cached copy · 10 Nov 2026". */
export function dataStatusText(kind: DataStatusKind, date?: Date | string | null): string {
  const day = formatStatusDate(date);
  switch (kind) {
    case "live":
      return day ? `Live · read ${day}` : "Live";
    case "stale":
      return day ? `Stale · last read ${day}` : "Stale · never read";
    case "cached":
      return day ? `Cached copy · ${day}` : "Cached copy · date unknown";
    case "simulated":
      return "Simulated";
    case "hand_entered":
      return "Hand-entered";
  }
}

/** A small label for a card, a list row or the data status panel. */
export function DataStatusLabel({
  kind,
  date,
  nameOnly = false,
  className,
}: {
  kind: DataStatusKind;
  /** live and stale: the last successful read. cached: the date of the copy. Ignored otherwise. */
  date?: Date | string | null;
  /** Just the name ("Cached copy"), for a legend. */
  nameOnly?: boolean;
  className?: string;
}) {
  const meta = DATA_STATUS_META[kind];
  const Icon = meta.icon;
  return (
    <Badge variant={meta.variant} title={meta.description} data-data-status={kind} className={cn(className)}>
      <Icon aria-hidden data-icon="inline-start" />
      {nameOnly ? meta.label : dataStatusText(kind, date)}
    </Badge>
  );
}
