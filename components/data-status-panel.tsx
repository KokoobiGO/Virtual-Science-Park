import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DATA_STATUS_KINDS,
  DataStatusLabel,
  dataStatusFromVerdict,
  dataStatusName,
  formatStatusDate,
  type DataStatusKind,
} from "@/components/data-status-label";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { createTranslator, formatNumber } from "@/lib/i18n/translate";
import type { SourceHealth } from "@/lib/sources/health";

/**
 * The data status panel (C13): every row of source_status with its verdict
 * from lib/sources/health.ts (judgeSources). Presentational: the caller reads
 * the rows (as the signed-in user) and judges them. `locale` picks the
 * language of its own words (C19); source names and messages are stored data.
 */
export function DataStatusPanel({
  entries,
  title,
  description,
  headingLevel = 2,
  locale = DEFAULT_LOCALE,
}: {
  entries: SourceHealth[];
  title?: string;
  description?: string;
  /** The title's heading level: 2 on its own page, 3 inside a section. */
  headingLevel?: 2 | 3;
  locale?: Locale;
}) {
  const Heading = headingLevel === 3 ? "h3" : "h2";
  const t = createTranslator(locale, "dataStatus");
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="text-heading">
          <Heading>{title ?? t("panel.title")}</Heading>
        </CardTitle>
        <CardDescription>{description ?? sourceSummary(entries, locale)}</CardDescription>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="py-2 text-muted-foreground">{t("panel.empty")}</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {entries.map((entry) => (
              <SourceRow key={entry.source} entry={entry} locale={locale} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function SourceRow({ entry, locale }: { entry: SourceHealth; locale: Locale }) {
  const t = createTranslator(locale, "dataStatus");
  const kind = dataStatusFromVerdict(entry.verdict);
  const loaded = kind === "hand_entered" ? formatStatusDate(entry.lastSuccessAt, locale) : null;
  return (
    <li
      data-source={entry.source}
      className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 md:grid md:grid-cols-[minmax(0,13rem)_minmax(0,15rem)_5.5rem_minmax(0,1fr)] md:items-baseline md:gap-4"
    >
      <div className="min-w-0">
        <p className="font-medium break-words">{entry.label}</p>
        <p className="font-mono text-xs break-all text-muted-foreground">{entry.source}</p>
      </div>
      <div>
        <DataStatusLabel kind={kind} date={statusDate(entry, kind)} locale={locale} />
      </div>
      <p className="text-sm text-muted-foreground tabular-nums">{itemCount(entry.itemCount, locale)}</p>
      <p className="text-sm break-words text-muted-foreground">
        {[loaded ? t("panel.loaded", { day: loaded }) : null, entry.message].filter(Boolean).join(" ") || "—"}
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

function itemCount(n: number | null, locale: Locale): string {
  const t = createTranslator(locale, "dataStatus");
  if (n === null) return t("panel.itemsUnknown");
  // "1,234 items" / "1 234 poster"; `count` picks the plural form.
  return t("panel.items", { count: n, n: formatNumber(n, locale) });
}

/** "9 sources: 4 live, 2 cached copies, 3 hand-entered." English when `locale` is left out. */
export function sourceSummary(entries: Pick<SourceHealth, "verdict">[], locale: Locale = DEFAULT_LOCALE): string {
  const t = createTranslator(locale, "dataStatus");
  if (entries.length === 0) return t("panel.noSources");
  const counts = new Map<DataStatusKind, number>();
  for (const e of entries) {
    const kind = dataStatusFromVerdict(e.verdict);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  const parts = DATA_STATUS_KINDS.filter((k) => counts.has(k)).map((k) => t(`panel.counts.${k}`, { count: counts.get(k)! }));
  return t("panel.summary", { total: t("panel.sources", { count: entries.length }), parts: parts.join(", ") });
}

/** What each label means, for under the panel. */
export function DataStatusLegend({
  kinds = ["live", "stale", "cached", "hand_entered", "simulated"],
  locale = DEFAULT_LOCALE,
}: {
  kinds?: DataStatusKind[];
  locale?: Locale;
}) {
  return (
    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      {kinds.map((kind) => (
        <div key={kind} className="flex flex-col items-start gap-1">
          <dt>
            <DataStatusLabel kind={kind} nameOnly locale={locale} />
          </dt>
          <dd className="text-muted-foreground">{dataStatusName(kind, locale).description}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Shown while the rows load. */
export function DataStatusPanelSkeleton({ locale = DEFAULT_LOCALE }: { locale?: Locale }) {
  const t = createTranslator(locale, "dataStatus");
  return (
    <Card aria-busy="true">
      <CardHeader className="border-b">
        <CardTitle className="text-heading">
          <h2>{t("panel.title")}</h2>
        </CardTitle>
        <CardDescription role="status">{t("panel.loading")}</CardDescription>
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
