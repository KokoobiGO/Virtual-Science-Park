/**
 * Quote-check numbers (A21), from the stats each stored profiling run writes
 * to job_runs (lib/inngest/functions/profile-company.ts): quotes found word
 * for word in their page, the fields that failed the check in the first
 * answer and were retried, and the fields that failed twice and were dropped
 * (stored as "missing").
 *
 * One run per company: its latest stored profiling run that was not a
 * refresh. The three gold members get a block of their own; the same totals
 * over every company's latest run follow, since 56 runs say more than 3.
 *
 * The drop rate asked for is dropped / fields the first answer gave a value
 * for. The stats do not hold that count, so it is not computed. What they do
 * allow, exactly:
 * - droppedOfFields: dropped / all profile fields (8 per run). A floor for it.
 * - droppedOfRetried: dropped / retried fields, the share the retry could not
 *   save. A ceiling for it, since every retried field had a value.
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, type Db } from "../db";
import { companies, jobRuns } from "../db/schema";
import { ProfileField } from "../schemas";
import { percent, ratio, textTable, type EvalResult } from "./result";

export const PROFILE_FIELD_COUNT = ProfileField.options.length;

export const QUOTE_CHECK_NOTE =
  `The drop rate asked for, dropped fields / fields the first answer gave a value for, cannot be computed: the run stats do not store that count. ` +
  `droppedOfFields = dropped / all ${PROFILE_FIELD_COUNT} profile fields is a floor for it; droppedOfRetried = dropped / retried fields (the share the retry could not save) is a ceiling.`;

/** What the profile-company job stores in job_runs.stats. Runs from before the weekly re-crawl (A23) have no `refresh`. */
export const ProfileRunStats = z.object({
  company: z.string().min(1),
  refresh: z.boolean().optional(),
  quotes: z.object({ found: z.number().int().min(0), total: z.number().int().min(0) }),
  retried: z.array(ProfileField),
  dropped: z.array(ProfileField),
});

export type ProfileRunRow = { id: string; startedAt: Date; finishedAt: Date | null; stats: unknown };

export type RunNumbers = {
  slug: string;
  runId: string;
  /** When the run stored its profile. */
  storedAt: string;
  quotesFound: number;
  quotesTotal: number;
  /** Share of the quotes, over the first answer and the retry, that were not word for word in their page. */
  quotesFailedShare: number | null;
  retried: ProfileField[];
  dropped: ProfileField[];
  droppedOfFields: number;
  droppedOfRetried: number | null;
};

export type QuoteTotals = {
  runs: number;
  quotesFound: number;
  quotesTotal: number;
  quotesFailedShare: number | null;
  retriedFields: number;
  droppedFields: number;
  /** Profile fields over all the runs: 8 per run. */
  profileFields: number;
  droppedOfFields: number | null;
  droppedOfRetried: number | null;
  /** How often each field was dropped. Built most often first, but jsonb does not keep key order: sort when showing. */
  droppedByField: Partial<Record<ProfileField, number>>;
};

export type SkippedRun = { runId: string; reason: string };

export type QuoteCheckSummary = {
  note: string;
  gold: { companies: RunNumbers[]; withoutRun: string[]; total: QuoteTotals };
  all: QuoteTotals;
};

export type QuoteCheckDetails = { runs: RunNumbers[]; skipped: SkippedRun[] };

function runNumbers(runId: string, storedAt: Date, stats: z.infer<typeof ProfileRunStats>): RunNumbers {
  const { found, total } = stats.quotes;
  return {
    slug: stats.company,
    runId,
    storedAt: storedAt.toISOString(),
    quotesFound: found,
    quotesTotal: total,
    quotesFailedShare: ratio(total - found, total),
    retried: stats.retried,
    dropped: stats.dropped,
    droppedOfFields: stats.dropped.length / PROFILE_FIELD_COUNT,
    droppedOfRetried: ratio(stats.dropped.length, stats.retried.length),
  };
}

/** The latest stored, non-refresh run per company, sorted by slug. Rows whose stats cannot be read are skipped, with the reason. */
export function latestProfileRuns(rows: ProfileRunRow[]): { runs: RunNumbers[]; skipped: SkippedRun[] } {
  const skipped: SkippedRun[] = [];
  const latest = new Map<string, { id: string; at: Date; stats: z.infer<typeof ProfileRunStats> }>();
  for (const row of rows) {
    const parsed = ProfileRunStats.safeParse(row.stats);
    if (!parsed.success) {
      skipped.push({ runId: row.id, reason: z.prettifyError(parsed.error).replace(/\s+/g, " ") });
      continue;
    }
    if (parsed.data.refresh) continue;
    // finishedAt is set right after the profile is stored, so the latest one is the profile now shown.
    const at = row.finishedAt ?? row.startedAt;
    const current = latest.get(parsed.data.company);
    if (!current || at > current.at || (at.getTime() === current.at.getTime() && row.id > current.id)) {
      latest.set(parsed.data.company, { id: row.id, at, stats: parsed.data });
    }
  }
  const runs = [...latest.values()].map((run) => runNumbers(run.id, run.at, run.stats)).sort((a, b) => (a.slug < b.slug ? -1 : 1));
  return { runs, skipped };
}

export function quoteTotals(runs: RunNumbers[]): QuoteTotals {
  const sum = (pick: (run: RunNumbers) => number) => runs.reduce((n, run) => n + pick(run), 0);
  const quotesFound = sum((r) => r.quotesFound);
  const quotesTotal = sum((r) => r.quotesTotal);
  const retriedFields = sum((r) => r.retried.length);
  const droppedFields = sum((r) => r.dropped.length);
  const profileFields = runs.length * PROFILE_FIELD_COUNT;

  const counts = new Map<ProfileField, number>();
  for (const field of runs.flatMap((r) => r.dropped)) counts.set(field, (counts.get(field) ?? 0) + 1);
  const droppedByField = Object.fromEntries(
    [...counts].sort(([a, n], [b, m]) => m - n || ProfileField.options.indexOf(a) - ProfileField.options.indexOf(b)),
  );

  return {
    runs: runs.length,
    quotesFound,
    quotesTotal,
    quotesFailedShare: ratio(quotesTotal - quotesFound, quotesTotal),
    retriedFields,
    droppedFields,
    profileFields,
    droppedOfFields: ratio(droppedFields, profileFields),
    droppedOfRetried: ratio(droppedFields, retriedFields),
    droppedByField,
  };
}

/** The numbers from the run rows: the gold members first, then every company. */
export function scoreQuoteCheck(goldSlugs: string[], rows: ProfileRunRow[]): EvalResult<QuoteCheckSummary, QuoteCheckDetails> {
  const { runs, skipped } = latestProfileRuns(rows);
  const goldRuns = runs.filter((run) => goldSlugs.includes(run.slug));
  return {
    kind: "quote_check",
    summary: {
      note: QUOTE_CHECK_NOTE,
      gold: { companies: goldRuns, withoutRun: goldSlugs.filter((slug) => !goldRuns.some((run) => run.slug === slug)), total: quoteTotals(goldRuns) },
      all: quoteTotals(runs),
    },
    details: { runs, skipped },
  };
}

/** The eval: read the gold members and every stored profiling run. */
export async function quoteCheck(db: Db = getDb()): Promise<EvalResult<QuoteCheckSummary, QuoteCheckDetails>> {
  const [gold, rows] = await Promise.all([
    db.select({ slug: companies.slug }).from(companies).where(eq(companies.isGold, true)).orderBy(companies.slug),
    db
      .select({ id: jobRuns.id, startedAt: jobRuns.startedAt, finishedAt: jobRuns.finishedAt, stats: jobRuns.stats })
      .from(jobRuns)
      .where(and(eq(jobRuns.job, "profile-company"), eq(jobRuns.status, "succeeded"))),
  ]);
  return scoreQuoteCheck(
    gold.map((g) => g.slug),
    rows,
  );
}

const fraction = (part: number, whole: number) => `${part}/${whole} = ${percent(ratio(part, whole))}`;
const fieldList = (fields: string[]) => (fields.length ? fields.join(", ") : "-");

export function quoteCheckTable({ summary, details }: EvalResult<QuoteCheckSummary, QuoteCheckDetails>): string[] {
  const { gold, all } = summary;
  const totalRow = (name: string, t: QuoteTotals) => [
    name,
    `${t.runs} runs`,
    `${t.quotesFound}/${t.quotesTotal}`,
    percent(t.quotesFailedShare),
    String(t.retriedFields),
    String(t.droppedFields),
    fraction(t.droppedFields, t.profileFields),
    fraction(t.droppedFields, t.retriedFields),
  ];
  const rows = [
    ["company", "stored (UTC)", "quotes found", "failed", "retried", "dropped", "dropped of fields", "dropped of retried"],
    ...gold.companies.map((r) => [
      r.slug,
      r.storedAt.slice(0, 16).replace("T", " "),
      `${r.quotesFound}/${r.quotesTotal}`,
      percent(r.quotesFailedShare),
      String(r.retried.length),
      String(r.dropped.length),
      fraction(r.dropped.length, PROFILE_FIELD_COUNT),
      fraction(r.dropped.length, r.retried.length),
    ]),
    totalRow("gold total", gold.total),
    totalRow("all companies", all),
  ];
  const lines = ["Latest stored profiling run per company (refreshes left out).", ...textTable(rows)];
  for (const r of gold.companies) lines.push(`${r.slug}: retried ${fieldList(r.retried)}; dropped ${fieldList(r.dropped)}`);
  if (gold.withoutRun.length) lines.push(`no stored profiling run: ${gold.withoutRun.join(", ")}`);
  const often = Object.entries(all.droppedByField).map(([field, n]) => `${field} ${n}`);
  lines.push(`dropped most often, all companies: ${often.length ? often.join(", ") : "-"}`);
  if (details.skipped.length) lines.push(`skipped ${details.skipped.length} runs whose stats could not be read (see details.skipped)`);
  lines.push(`note: ${summary.note}`);
  return lines;
}
