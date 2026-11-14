import { useId, type ReactNode } from "react";
import { DataStatusLabel, dataStatusFromVerdict, dataStatusName } from "@/components/data-status-label";
import { statusDate } from "@/components/data-status-panel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { createTranslator, type Messages, type Translator } from "@/lib/i18n/translate";
import { ProfileField } from "@/lib/schemas";
import type { SourceHealth } from "@/lib/sources/health";
import {
  accuracyText,
  ELIGIBILITY_SENTENCES,
  formatDateTime,
  formatDay,
  handCheckStarted,
  knownLimits,
  percentOf,
  ratingText,
  summarizeStaffSession,
  summarizeTimedTest,
  timedRunText,
  type FileResult,
  type MatchingResult,
  type Run,
  type TrustReport,
} from "@/lib/trust/report";
import type {
  LinkCheckSummary,
  PrivacySummary,
  ProfileAccuracySummary,
  QuoteCheckSummary,
  QuoteTotals,
  RedTeamSummary,
  StaffSessionResults,
  TimedTestResults,
} from "@/lib/trust/shapes";
import { automatedReviewCompanies } from "@/lib/trust/shapes";

/**
 * The Trust report's sections (C12). The words are in the reader's language
 * (C19, messages/*.json `trust`): each section takes `locale`, English when
 * left out. Numbers, source names and messages, staff quotes and notes are
 * shown as stored.
 */

type T = Translator<"trust">;

/** Display names for the red-team groups (their keys in messages/*.json); the stored ids stay as they are. */
const RED_TEAM_GROUP_KEYS: Record<string, keyof Messages["trust"]["redTeam"]["groups"]> = {
  relevant: "relevant",
  unrelated: "unrelated",
  override: "override",
  indirect_injection: "indirectInjection",
  privacy: "privacy",
  eligibility: "canWeApply",
};

function redTeamGroupLabel(group: string, t: T): string {
  return Object.hasOwn(RED_TEAM_GROUP_KEYS, group) ? t(`redTeam.groups.${RED_TEAM_GROUP_KEYS[group]}`) : group.replace(/_/g, " ");
}

const FIELDS_PER_PROFILE = ProfileField.options.length;

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

/** One section of the report: an h2 under the page's h1, then when it was measured and what it measures. */
function Section({ title, description, when, children }: { title: string; description: string; when?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
        {when ? <p className="text-xs text-muted-foreground">{when}</p> : null}
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">{children}</CardContent>
    </Card>
  );
}

function NotMeasured({ text }: { text: string }) {
  return <p className="font-medium">{text}</p>;
}

function Unreadable({ what, problem, t }: { what: string; problem: string; t: T }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="font-medium">{t("unreadable", { what })}</p>
      <p className="text-xs break-words text-muted-foreground">{problem}</p>
    </div>
  );
}

/** The date in a card's corner, for a stored run. Nothing when there is no run: the card says "not measured yet". */
function runWhen(run: Run<unknown>, t: T): ReactNode {
  return run.status === "not_measured" ? null : <span>{t("ranAt", { date: formatDateTime(run.ranAt, t.locale) })}</span>;
}

function fileWhen(result: FileResult<unknown>, t: T): ReactNode {
  return result.status === "measured" ? <span>{t("heldOn", { date: formatDay(result.date, t.locale) })}</span> : null;
}

/**
 * A table of numbers (C20): a caption for screen readers, column headers, and
 * the first cell of each row as the row's header. On a phone a wide table
 * scrolls sideways inside its own box, which can take keyboard focus to
 * scroll; the page itself never scrolls sideways.
 */
export function Table({ caption, head, rows, foot }: { caption: string; head: ReactNode[]; rows: ReactNode[][]; foot?: ReactNode[][] }) {
  const captionId = useId();
  const cell = "px-2 py-1.5 align-top first:pl-0 last:pr-0";
  const row = (cells: ReactNode[]) =>
    cells.map((c, i) =>
      i === 0 ? (
        <th key={i} scope="row" className={`${cell} text-left font-medium`}>
          {c}
        </th>
      ) : (
        <td key={i} className={cell}>
          {c}
        </td>
      ),
    );
  return (
    <div
      role="region"
      aria-labelledby={captionId}
      tabIndex={0}
      className="max-w-full overflow-x-auto rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* Wide enough that cells stay readable; narrower screens scroll the box. */}
      <table className={`w-full border-collapse text-left text-sm ${head.length > 4 ? "min-w-[44rem]" : head.length > 3 ? "min-w-[34rem]" : ""}`}>
        <caption id={captionId} className="sr-only">
          {caption}
        </caption>
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b">
            {head.map((h, i) => (
              <th key={i} scope="col" className={`${cell} font-medium`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, r) => (
            <tr key={r} className="border-b last:border-b-0">
              {row(cells)}
            </tr>
          ))}
        </tbody>
        {foot?.length ? (
          <tfoot className="font-medium">
            {foot.map((cells, r) => (
              <tr key={r} className="border-t">
                {row(cells)}
              </tr>
            ))}
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// At a glance
// ---------------------------------------------------------------------------

type Tile = { key: string; label: string; value: string; detail: string; note?: string };

/** The headline number of each stored check, or "not measured yet". Pure, so it can be tested without a page. */
export function summaryTiles(report: Pick<TrustReport, "profileAccuracy" | "quoteCheck" | "linkCheck" | "redTeam" | "privacy">, locale: Locale = DEFAULT_LOCALE): Tile[] {
  const t = createTranslator(locale, "trust");
  const none = t("notMeasured");
  const tiles: Tile[] = [];

  const pa = report.profileAccuracy;
  const all = pa.status === "measured" && handCheckStarted(pa.summary) ? pa.summary.total.stated : null;
  tiles.push(
    all && all.checked > 0
      ? {
          key: "accuracy",
          label: t("summary.accuracy.label"),
          value: percentOf(all.right, all.checked, locale),
          detail: t("summary.accuracy.detail", { right: all.right, checked: all.checked }),
          note: pa.status === "measured" && automatedReviewCompanies(pa.summary).length ? t("summary.automated") : undefined,
        }
      : { key: "accuracy", label: t("summary.accuracy.label"), value: "-", detail: none },
  );

  const qc = report.quoteCheck;
  tiles.push(
    qc.status === "measured"
      ? {
          key: "quotes",
          label: t("summary.quotes.label"),
          value: percentOf(qc.summary.all.quotesFound, qc.summary.all.quotesTotal, locale),
          detail: t("summary.quotes.detail", { found: qc.summary.all.quotesFound, total: qc.summary.all.quotesTotal }),
        }
      : { key: "quotes", label: t("summary.quotes.label"), value: "-", detail: none },
  );

  const lc = report.linkCheck;
  tiles.push(
    lc.status === "measured"
      ? {
          key: "links",
          label: t("summary.links.label"),
          value: percentOf(lc.summary.ok, lc.summary.checked, locale),
          detail: t("summary.links.detail", { ok: lc.summary.ok, checked: lc.summary.checked, broken: lc.summary.broken }),
        }
      : { key: "links", label: t("summary.links.label"), value: "-", detail: none },
  );

  const rt = report.redTeam;
  if (rt.status === "measured") {
    const passed = rt.summary.groups.reduce((n, g) => n + g.passed, 0);
    const total = rt.summary.groups.reduce((n, g) => n + g.total, 0);
    tiles.push({ key: "redTeam", label: t("summary.redTeam.label"), value: percentOf(passed, total, locale), detail: t("summary.redTeam.detail", { passed, total }) });
  } else {
    tiles.push({ key: "redTeam", label: t("summary.redTeam.label"), value: "-", detail: none });
  }

  const pv = report.privacy;
  tiles.push(
    pv.status === "measured"
      ? {
          key: "privacy",
          label: t("summary.privacy.label"),
          value: percentOf(pv.summary.passed, pv.summary.total, locale),
          detail: t("summary.privacy.detail", { passed: pv.summary.passed, total: pv.summary.total }),
        }
      : { key: "privacy", label: t("summary.privacy.label"), value: "-", detail: none },
  );
  return tiles;
}

/** The plain-language top of the report: what was checked, and the headline numbers. */
export function TrustSummary({ report, locale = DEFAULT_LOCALE }: { report: Parameters<typeof summaryTiles>[0]; locale?: Locale }) {
  const t = createTranslator(locale, "trust");
  const tiles = summaryTiles(report, locale);
  return (
    <section aria-labelledby="trust-summary" className="flex flex-col gap-3 rounded-xl border border-primary/20 bg-card p-4 shadow-xs sm:p-5">
      <div className="flex flex-col gap-1">
        <h2 id="trust-summary" className="text-heading">
          {t("summary.title")}
        </h2>
        <p className="max-w-prose text-sm text-muted-foreground">{t("summary.intro")}</p>
      </div>
      <ul aria-label={t("summary.caption")} className="grid stagger gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {tiles.map((tile) => (
          <li key={tile.key} className="flex flex-col gap-0.5 rounded-lg bg-muted/60 px-3 py-2.5">
            {tile.value === "-" ? null : <span className="text-2xl font-semibold tabular-nums">{tile.value}</span>}
            <span className="text-sm font-medium">{tile.label}</span>
            <span className="text-xs text-muted-foreground">{tile.detail}</span>
            {tile.note ? <span className="text-xs text-muted-foreground">{tile.note}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

export function ProfileAccuracySection({ run, locale = DEFAULT_LOCALE }: { run: Run<ProfileAccuracySummary>; locale?: Locale }) {
  const t = createTranslator(locale, "trust");
  const accuracy = (group: Parameters<typeof accuracyText>[0]) => accuracyText(group, locale);
  return (
    <Section title={t("profileAccuracy.title")} description={t("profileAccuracy.description")} when={runWhen(run, t)}>
      {run.status === "not_measured" ? <NotMeasured text={t("notMeasured")} /> : null}
      {run.status === "unreadable" ? <Unreadable what={t("profileAccuracy.unreadable")} problem={run.problem} t={t} /> : null}
      {run.status === "measured" && !handCheckStarted(run.summary) ? (
        <>
          <NotMeasured text={t("handCheckNotFinished")} />
          <p className="text-muted-foreground">
            {t("profileAccuracy.latestRun", { claims: run.summary.total.all.claims, profiles: run.summary.companies.length })}
          </p>
        </>
      ) : null}
      {run.status === "measured" && handCheckStarted(run.summary) ? (
        <>
          {automatedReviewCompanies(run.summary).length ? (
            <p className="font-medium">{t("profileAccuracy.automatedReview", { profiles: automatedReviewCompanies(run.summary).join(", ") })}</p>
          ) : null}
          <Table
            caption={t("profileAccuracy.caption")}
            head={[t("profileAccuracy.head.profile"), t("profileAccuracy.head.stated"), t("profileAccuracy.head.inferred"), t("profileAccuracy.head.missing")]}
            rows={run.summary.companies.map((c) => [c.company, accuracy(c.stated), accuracy(c.inferred), accuracy(c.missing)])}
            foot={[[t("allGoldProfiles"), accuracy(run.summary.total.stated), accuracy(run.summary.total.inferred), accuracy(run.summary.total.missing)]]}
          />
          {!run.summary.complete ? (
            <p className="text-muted-foreground">
              {t("profileAccuracy.notFinished", { checked: run.summary.total.all.checked, claims: run.summary.total.all.claims })}
            </p>
          ) : null}
        </>
      ) : null}
    </Section>
  );
}

export function QuoteCheckSection({ run, locale = DEFAULT_LOCALE }: { run: Run<QuoteCheckSummary>; locale?: Locale }) {
  const t = createTranslator(locale, "trust");
  const found = (part: number, whole: number) => t("ofPercent", { part, whole, percent: percentOf(part, whole, locale) });
  const totalRow = (name: string, q: QuoteTotals) => [
    name,
    found(q.quotesFound, q.quotesTotal),
    String(q.quotesTotal - q.quotesFound),
    t("of", { part: q.droppedFields, whole: q.profileFields }),
    "",
  ];
  return (
    <Section title={t("quoteCheck.title")} description={t("quoteCheck.description")} when={runWhen(run, t)}>
      {run.status === "not_measured" ? <NotMeasured text={t("notMeasured")} /> : null}
      {run.status === "unreadable" ? <Unreadable what={t("quoteCheck.unreadable")} problem={run.problem} t={t} /> : null}
      {run.status === "measured" ? (
        <Table
          caption={t("quoteCheck.caption")}
          head={[
            t("quoteCheck.head.profile"),
            t("quoteCheck.head.found"),
            t("quoteCheck.head.notFound"),
            t("quoteCheck.head.dropped"),
            t("quoteCheck.head.profiled"),
          ]}
          rows={run.summary.gold.companies.map((c) => [
            c.slug,
            found(c.quotesFound, c.quotesTotal),
            String(c.quotesTotal - c.quotesFound),
            c.dropped.length
              ? `${t("of", { part: c.dropped.length, whole: FIELDS_PER_PROFILE })}: ${c.dropped.join(", ")}`
              : t("of", { part: 0, whole: FIELDS_PER_PROFILE }),
            formatDateTime(new Date(c.storedAt), locale),
          ])}
          foot={[
            totalRow(t("allGoldProfiles"), run.summary.gold.total),
            totalRow(t("quoteCheck.allProfiled", { count: run.summary.all.runs }), run.summary.all),
          ]}
        />
      ) : null}
    </Section>
  );
}

export function LinkHealthSection({ run, locale = DEFAULT_LOCALE }: { run: Run<LinkCheckSummary>; locale?: Locale }) {
  const t = createTranslator(locale, "trust");
  return (
    <Section title={t("linkHealth.title")} description={t("linkHealth.description")} when={runWhen(run, t)}>
      {run.status === "not_measured" ? <NotMeasured text={t("notMeasured")} /> : null}
      {run.status === "unreadable" ? <Unreadable what={t("linkHealth.unreadable")} problem={run.problem} t={t} /> : null}
      {run.status === "measured" ? (
        <Table
          caption={t("linkHealth.caption")}
          head={[
            t("linkHealth.head.checked"),
            t("linkHealth.head.ok"),
            t("linkHealth.head.broken"),
            t("linkHealth.head.blocked"),
            t("linkHealth.head.unverifiable"),
          ]}
          rows={[
            [
              String(run.summary.checked),
              `${run.summary.ok} (${percentOf(run.summary.ok, run.summary.checked, locale)})`,
              String(run.summary.broken),
              String(run.summary.blocked),
              String(run.summary.unverifiable),
            ],
          ]}
        />
      ) : null}
    </Section>
  );
}

/** The labels a source can carry, in the order the description explains them. */
const SOURCE_KINDS = ["live", "stale", "cached", "hand_entered"] as const;

export function SourceStatusSection({ sources, locale = DEFAULT_LOCALE }: { sources: SourceHealth[]; locale?: Locale }) {
  const t = createTranslator(locale, "trust");
  const kinds = SOURCE_KINDS.map((kind) => {
    const { label, description } = dataStatusName(kind, locale);
    return `${label}: ${description}`;
  });
  return (
    <Section title={t("sourceStatus.title")} description={`${t("sourceStatus.intro")} ${kinds.join(" ")}`}>
      {sources.length ? (
        <Table
          caption={t("sourceStatus.caption")}
          head={[
            t("sourceStatus.head.source"),
            t("sourceStatus.head.status"),
            t("sourceStatus.head.lastSuccess"),
            t("sourceStatus.head.items"),
            t("sourceStatus.head.note"),
          ]}
          rows={sources.map((s) => {
            const kind = dataStatusFromVerdict(s.verdict);
            return [
              s.label,
              <DataStatusLabel key="status" kind={kind} date={statusDate(s, kind)} locale={locale} />,
              s.lastSuccessAt ? formatDateTime(s.lastSuccessAt, locale) : t("sourceStatus.never"),
              s.itemCount === null ? "-" : String(s.itemCount),
              sourceNote(s, t),
            ];
          })}
        />
      ) : (
        <NotMeasured text={t("notMeasured")} />
      )}
    </Section>
  );
}

/** Our note on a source, then the source's own message as stored. */
function sourceNote(s: SourceHealth, t: T): string {
  const parts: string[] = [];
  if (s.verdict === "cached" && !s.cachedAt) parts.push(t("sourceStatus.copyDateUnknown"));
  if (s.verdict === "stale") parts.push(t("sourceStatus.noRecentSuccess"));
  if (s.message) parts.push(s.message);
  return parts.join(" ");
}

function matchingWhen(matching: MatchingResult, t: T): ReactNode {
  if (matching.status === "unreadable") return <span>{t("ranAt", { date: formatDateTime(matching.ranAt, t.locale) })}</span>;
  if (matching.status !== "measured") return null;
  const judged = matching.lastJudgedAt
    ? t("matching.lastJudged", { date: formatDateTime(matching.lastJudgedAt, t.locale) })
    : t("matching.nothingJudged");
  return matching.countedAt ? (
    <span>{t("matching.counted", { date: formatDateTime(matching.countedAt, t.locale), judged })}</span>
  ) : (
    <span>{judged.charAt(0).toUpperCase() + judged.slice(1)}</span>
  );
}

export function MatchingSection({ matching, locale = DEFAULT_LOCALE }: { matching: MatchingResult; locale?: Locale }) {
  const t = createTranslator(locale, "trust");
  const share = (part: number, whole: number) => `${part} (${percentOf(part, whole, locale)})`;
  return (
    <Section title={t("matching.title")} description={t("matching.description")} when={matchingWhen(matching, t)}>
      <p className="rounded-lg border bg-muted/50 px-3 py-2 font-medium">{ELIGIBILITY_SENTENCES[locale]}</p>
      {matching.status === "not_measured" ? <NotMeasured text={t("notMeasured")} /> : null}
      {matching.status === "unreadable" ? <Unreadable what={t("matching.unreadable")} problem={matching.problem} t={t} /> : null}
      {matching.status === "measured" ? (
        <>
          <p className="text-muted-foreground">{t(`matching.scope.${matching.scope}`)}</p>
          <Table
            caption={t("matching.caption")}
            head={[
              t("matching.head.ranking"),
              t("matching.head.members"),
              t("matching.head.ranked"),
              t("matching.head.judged"),
              t("matching.head.kept"),
              t("matching.head.rejected"),
              t("matching.head.notJudged"),
            ]}
            rows={matching.modes.map((m) => [
              t(`matching.modes.${m.mode}`),
              String(m.companies),
              String(m.ranked),
              String(m.judged),
              share(m.kept, m.judged),
              share(m.rejected, m.judged),
              String(m.notJudgedYet),
            ])}
          />
        </>
      ) : null}
    </Section>
  );
}

export function RedTeamSection({ run, locale = DEFAULT_LOCALE }: { run: Run<RedTeamSummary>; locale?: Locale }) {
  const t = createTranslator(locale, "trust");
  return (
    <Section title={t("redTeam.title")} description={t("redTeam.description")} when={runWhen(run, t)}>
      {run.status === "not_measured" ? <NotMeasured text={t("notMeasured")} /> : null}
      {run.status === "unreadable" ? <Unreadable what={t("redTeam.unreadable")} problem={run.problem} t={t} /> : null}
      {run.status === "measured" ? (
        <Table
          caption={t("redTeam.caption")}
          head={[t("redTeam.head.group"), t("redTeam.head.passed"), t("redTeam.head.rate")]}
          rows={run.summary.groups.map((g) => [
            redTeamGroupLabel(g.group, t),
            t("of", { part: g.passed, whole: g.total }),
            percentOf(g.passed, g.total, locale),
          ])}
        />
      ) : null}
    </Section>
  );
}

export function PrivacySection({ run, locale = DEFAULT_LOCALE }: { run: Run<PrivacySummary>; locale?: Locale }) {
  const t = createTranslator(locale, "trust");
  return (
    <Section title={t("privacy.title")} description={t("privacy.description")} when={runWhen(run, t)}>
      {run.status === "not_measured" ? <NotMeasured text={t("notMeasured")} /> : null}
      {run.status === "unreadable" ? <Unreadable what={t("privacy.unreadable")} problem={run.problem} t={t} /> : null}
      {run.status === "measured" ? (
        <p>
          {t.rich("privacy.result", {
            count: (chunk) => <span className="font-medium">{chunk}</span>,
            passed: run.summary.passed,
            total: run.summary.total,
            percent: percentOf(run.summary.passed, run.summary.total, locale),
          })}
        </p>
      ) : null}
    </Section>
  );
}

export function TimedTestSection({ result, locale = DEFAULT_LOCALE }: { result: FileResult<TimedTestResults>; locale?: Locale }) {
  const t = createTranslator(locale, "trust");
  return (
    <Section title={t("timed.title")} description={t("timed.description")} when={fileWhen(result, t)}>
      {result.status === "not_measured" ? <NotMeasured text={t("notMeasured")} /> : null}
      {result.status === "unreadable" ? <Unreadable what={t("timed.unreadable")} problem={result.problem} t={t} /> : null}
      {result.status === "measured" ? (
        <>
          <Table
            caption={t("timed.caption")}
            head={[t("timed.head.task"), t("timed.head.tester"), t("timed.head.byHand"), t("timed.head.withTool")]}
            rows={summarizeTimedTest(result.data).map((row) => [
              t(`timed.tasks.${row.task}`),
              row.participant,
              timedRunText(row.byHand, row.keyItems, locale),
              timedRunText(row.withTool, row.keyItems, locale),
            ])}
          />
          <p className="text-muted-foreground">{t("timed.timeNote")}</p>
          {result.data.notes ? <p className="text-muted-foreground">{result.data.notes}</p> : null}
        </>
      ) : null}
    </Section>
  );
}

export function StaffSessionSection({ result, locale = DEFAULT_LOCALE }: { result: FileResult<StaffSessionResults>; locale?: Locale }) {
  const t = createTranslator(locale, "trust");
  const summary = result.status === "measured" ? summarizeStaffSession(result.data) : null;
  return (
    <Section title={t("staffSession.title")} description={t("staffSession.description")} when={fileWhen(result, t)}>
      {result.status === "not_measured" ? <NotMeasured text={t("notMeasured")} /> : null}
      {result.status === "unreadable" ? <Unreadable what={t("staffSession.unreadable")} problem={result.problem} t={t} /> : null}
      {result.status === "measured" && summary ? (
        <>
          <p className="text-muted-foreground">{t("staffSession.tookPart", { count: result.data.staff })}</p>
          <Table
            caption={t("staffSession.caption")}
            head={[t("staffSession.head.member"), t("staffSession.head.claims"), t("staffSession.head.top5")]}
            rows={summary.members.map((m) => [m.member, claimsText(m.claims, t), ratingText(m.top5, locale)])}
            foot={
              summary.members.length > 1
                ? [[t("staffSession.all"), claimsText(summary.total.claims, t), ratingText(summary.total.top5, locale)]]
                : undefined
            }
          />
          {summary.quotes.length ? (
            <div className="flex flex-col gap-2">
              <p className="text-muted-foreground">{t("staffSession.quotesIntro")}</p>
              {summary.quotes.map((quote, i) => (
                <blockquote key={i} className="border-l-2 pl-3 italic">
                  &ldquo;{quote}&rdquo;
                </blockquote>
              ))}
            </div>
          ) : null}
          {summary.quotesWithheld ? <p className="text-muted-foreground">{t("staffSession.withheld", { count: summary.quotesWithheld })}</p> : null}
          {result.data.notes ? <p className="text-muted-foreground">{result.data.notes}</p> : null}
        </>
      ) : null}
    </Section>
  );
}

/** "5 of 7 (71%); 1 wrong, 1 unsure". */
function claimsText(claims: { rated: number; good: number; wrong: number; unsure: number }, t: T): string {
  const rating = ratingText(claims, t.locale);
  return claims.rated ? t("staffSession.claims", { rating, wrong: claims.wrong, unsure: claims.unsure }) : rating;
}

export function KnownLimitsSection({ locale = DEFAULT_LOCALE }: { locale?: Locale }) {
  const t = createTranslator(locale, "trust");
  return (
    <Section title={t("knownLimits.title")} description={t("knownLimits.description")}>
      <ul className="flex list-disc flex-col gap-2 pl-5">
        {knownLimits(locale).map((limit) => (
          <li key={limit}>{limit}</li>
        ))}
      </ul>
    </Section>
  );
}
