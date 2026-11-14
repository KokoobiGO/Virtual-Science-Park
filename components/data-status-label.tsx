import { cn } from "cn";
import { Archive, ClockFading, FlaskConical, PenLine, Radio, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { formatDayOrNull } from "@/lib/i18n/format";
import { createTranslator, MESSAGES } from "@/lib/i18n/translate";
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

const LOOK: Record<DataStatusKind, Pick<DataStatusMeta, "variant" | "icon">> = {
  live: { variant: "success", icon: Radio },
  stale: { variant: "warning", icon: ClockFading },
  cached: { variant: "info", icon: Archive },
  simulated: { variant: "simulated", icon: FlaskConical },
  hand_entered: { variant: "simulated", icon: PenLine },
};

/** The name and the sentence for a kind in one language (messages/*.json, `dataStatus.kinds`). */
export function dataStatusName(kind: DataStatusKind, locale: Locale = DEFAULT_LOCALE): { label: string; description: string } {
  return MESSAGES[locale].dataStatus.kinds[kind];
}

/** Each kind in English: its name, sentence, colour and icon. */
export const DATA_STATUS_META: Record<DataStatusKind, DataStatusMeta> = Object.fromEntries(
  (Object.keys(LOOK) as DataStatusKind[]).map((kind) => [kind, { ...dataStatusName(kind), ...LOOK[kind] }]),
) as Record<DataStatusKind, DataStatusMeta>;

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

/** "14 Nov 2026" in Swedish time ("14 nov. 2026" in Swedish), or null for no or an unreadable date. */
export function formatStatusDate(date: Date | string | null | undefined, locale: Locale = DEFAULT_LOCALE): string | null {
  return formatDayOrNull(date, locale);
}

/** The words on the label, e.g. "Cached copy · 10 Nov 2026". English when `locale` is left out. */
export function dataStatusText(kind: DataStatusKind, date?: Date | string | null, locale: Locale = DEFAULT_LOCALE): string {
  const day = formatStatusDate(date, locale);
  const t = createTranslator(locale, "dataStatus");
  switch (kind) {
    case "live":
      return day ? t("liveRead", { day }) : t("kinds.live.label");
    case "stale":
      return day ? t("staleRead", { day }) : t("staleNever");
    case "cached":
      return day ? t("cachedDay", { day }) : t("cachedUnknown");
    case "simulated":
      return t("kinds.simulated.label");
    case "hand_entered":
      return t("kinds.hand_entered.label");
  }
}

/** A small label for a card, a list row or the data status panel. */
export function DataStatusLabel({
  kind,
  date,
  nameOnly = false,
  locale = DEFAULT_LOCALE,
  className,
}: {
  kind: DataStatusKind;
  /** live and stale: the last successful read. cached: the date of the copy. Ignored otherwise. */
  date?: Date | string | null;
  /** Just the name ("Cached copy"), for a legend. */
  nameOnly?: boolean;
  /** The language of the words (C19); English when left out. */
  locale?: Locale;
  className?: string;
}) {
  const { icon: Icon, variant } = LOOK[kind];
  const name = dataStatusName(kind, locale);
  return (
    <Badge variant={variant} title={name.description} data-data-status={kind} className={cn(className)}>
      <Icon aria-hidden data-icon="inline-start" />
      {nameOnly ? name.label : dataStatusText(kind, date, locale)}
    </Badge>
  );
}
