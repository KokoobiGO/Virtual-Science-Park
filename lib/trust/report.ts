/**
 * The Trust report (C12) as plain data. Pure: lib/trust/load.ts reads the
 * rows and files, app/trust renders.
 *
 * Product rule: only measured numbers, each with the date of its run. A
 * section without a run is "not measured yet"; a run whose summary cannot be
 * read says so with its date. Nothing here makes up or fills in a number.
 */
import { z } from "zod";
import type { AppRole, MatchMode } from "../schemas";
import { judgeSources, type SourceHealth, type SourceStatusRow } from "../sources/health";
import {
  LinkCheckSummary,
  PrivacySummary,
  ProfileAccuracySummary,
  QuoteCheckSummary,
  RedTeamSummary,
  StaffSessionResults,
  TimedTestResults,
  type AccuracyGroup,
} from "./shapes";

export const NOT_MEASURED = "not measured yet";
export const HAND_CHECK_NOT_FINISHED = "not measured yet: the team's hand-check is not finished";

export const ELIGIBILITY_SENTENCE =
  'The system never decides eligibility: every match is a "potential match". Whether a company can apply stays a decision for people.';

export const KNOWN_LIMITS = [
  "A profile quote proves that the quote is on the company's page, word for word. It does not prove that the quote supports the value shown next to it: that is what the team's hand-check is for.",
  "The EU Funding & Tenders portal answers 200 for any topic id, so a working EU link only means the portal is up. Energimyndigheten also answers 200 for a missing page.",
  "Profiles, the judge and the trend notes run on a small, free test model (NVIDIA Nemotron 3.5 Lightning), not on Claude. Answers that fail the checks are asked again or dropped, never shown; the numbers on this page are for that model.",
  "Some sources are entered by hand by the team: regional funding, the curated testbed list and BSP's recurring events. They are marked simulated and change only when the team edits them.",
];

/** The eval_runs kinds the report reads. */
export const TRUST_EVAL_KINDS = ["profile_accuracy", "quote_check", "link_check", "red_team", "privacy"] as const;
export type TrustEvalKind = (typeof TRUST_EVAL_KINDS)[number];

export type EvalRunRow = { kind: string; ranAt: Date; summary: unknown };

/** The latest stored run of one eval. */
export type Run<T> =
  | { status: "measured"; ranAt: Date; summary: T }
  | { status: "not_measured" }
  | { status: "unreadable"; ranAt: Date; problem: string };

/** A results file the team writes by hand. Absent: not measured yet. */
export type FileResult<T> = { status: "measured"; date: string; data: T } | { status: "not_measured" } | { status: "unreadable"; problem: string };

/** Ranked matches per mode, counted over the rows the viewer may read. */
export type MatchCountRow = {
  mode: MatchMode;
  /** Companies with at least one row in this mode. */
  companies: number;
  /** Rows with a stored judgement, including rows that later left the top 20. */
  judged: number;
  rejected: number;
  /** In a top 20 now, not judged yet. */
  rankedUnjudged: number;
  lastJudgedAt: Date | null;
};

export type MatchingResult =
  | {
      status: "measured";
      /** The latest judgement in the rows counted. */
      ranAt: Date;
      /** Staff count every member's public ranking; a member counts its own company only (row-level security). */
      scope: "all_members_public" | "own_company";
      modes: (MatchCountRow & { kept: number })[];
    }
  | { status: "not_measured" };

export type TrustReport = {
  profileAccuracy: Run<ProfileAccuracySummary>;
  quoteCheck: Run<QuoteCheckSummary>;
  linkCheck: Run<LinkCheckSummary>;
  sources: SourceHealth[];
  matching: MatchingResult;
  redTeam: Run<RedTeamSummary>;
  privacy: Run<PrivacySummary>;
  timedTest: FileResult<TimedTestResults>;
  staffSession: FileResult<StaffSessionResults>;
};

export type TrustInput = {
  role: AppRole;
  evalRuns: EvalRunRow[];
  sources: SourceStatusRow[];
  matches: MatchCountRow[];
  /** The file's text, or null when there is no file. */
  timedTestText: string | null;
  staffSessionText: string | null;
  now: Date;
};

export function buildTrustReport(input: TrustInput): TrustReport {
  const run = <T>(kind: TrustEvalKind, schema: z.ZodType<T>) => readRun(input.evalRuns, kind, schema);
  return {
    profileAccuracy: run("profile_accuracy", ProfileAccuracySummary),
    quoteCheck: run("quote_check", QuoteCheckSummary),
    linkCheck: run("link_check", LinkCheckSummary),
    sources: judgeSources(input.sources, input.now),
    matching: matchingResult(input.role, input.matches),
    redTeam: run("red_team", RedTeamSummary),
    privacy: run("privacy", PrivacySummary),
    timedTest: parseResultsFile(input.timedTestText, TimedTestResults),
    staffSession: parseResultsFile(input.staffSessionText, StaffSessionResults),
  };
}

/** The latest run of `kind` among the rows, parsed. */
export function readRun<T>(rows: EvalRunRow[], kind: string, schema: z.ZodType<T>): Run<T> {
  const latest = rows.filter((r) => r.kind === kind).reduce<EvalRunRow | null>((a, b) => (!a || b.ranAt > a.ranAt ? b : a), null);
  if (!latest) return { status: "not_measured" };
  const parsed = schema.safeParse(latest.summary);
  if (!parsed.success) return { status: "unreadable", ranAt: latest.ranAt, problem: oneLine(z.prettifyError(parsed.error)) };
  return { status: "measured", ranAt: latest.ranAt, summary: parsed.data };
}

export function parseResultsFile<T extends { date: string }>(text: string | null, schema: z.ZodType<T>): FileResult<T> {
  if (text === null) return { status: "not_measured" };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return { status: "unreadable", problem: `not valid JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return { status: "unreadable", problem: oneLine(z.prettifyError(parsed.error)) };
  return { status: "measured", date: parsed.data.date, data: parsed.data };
}

export function matchingResult(role: AppRole, rows: MatchCountRow[]): MatchingResult {
  const judgedAt = rows.map((r) => r.lastJudgedAt).filter((d): d is Date => d !== null);
  if (!judgedAt.length) return { status: "not_measured" };
  return {
    status: "measured",
    ranAt: new Date(Math.max(...judgedAt.map((d) => d.getTime()))),
    scope: role === "staff" ? "all_members_public" : "own_company",
    // Public first: it is the ranking both staff and members can read.
    modes: [...rows].sort((a, b) => (a.mode === b.mode ? 0 : a.mode === "public" ? -1 : 1)).map((r) => ({ ...r, kept: r.judged - r.rejected })),
  };
}

/** False until the team has given at least one gold claim a verdict. */
export function handCheckStarted(summary: ProfileAccuracySummary): boolean {
  return summary.total.all.checked > 0;
}

/** One accuracy cell: "80% (4 of 5 checked)", or "not measured yet" while nothing in the group is checked. */
export function accuracyText(group: AccuracyGroup): string {
  if (group.checked === 0 || group.accuracy === null) return NOT_MEASURED;
  return `${Math.round(group.accuracy * 100)}% (${group.right} of ${group.checked} checked)`;
}

export type MethodSummary = { method: "with_app" | "without_app"; trials: number; completed: number; medianSeconds: number | null };

/** Per method, in a fixed order: how many trials, how many completed, and the median time of the completed ones. */
export function summarizeTimedTest(results: TimedTestResults): MethodSummary[] {
  return (["with_app", "without_app"] as const)
    .map((method) => {
      const trials = results.trials.filter((t) => t.method === method);
      const done = trials.filter((t) => t.completed);
      return { method, trials: trials.length, completed: done.length, medianSeconds: median(done.map((t) => t.seconds)) };
    })
    .filter((m) => m.trials > 0);
}

export type RatingSummary = { kind: "match" | "connection" | "profile"; useful: number; notUseful: number; unsure: number; total: number };

/** Per kind of item rated, in a fixed order, only the kinds that were rated. */
export function summarizeStaffSession(results: StaffSessionResults): RatingSummary[] {
  return (["match", "connection", "profile"] as const)
    .map((kind) => {
      const rated = results.ratings.filter((r) => r.kind === kind);
      const n = (verdict: string) => rated.filter((r) => r.verdict === verdict).length;
      return { kind, useful: n("useful"), notUseful: n("not_useful"), unsure: n("unsure"), total: rated.length };
    })
    .filter((s) => s.total > 0);
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** "25%" for 1 of 4; "-" when there is nothing to divide by. */
export function percentOf(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "-";
}

const dateTime = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Stockholm",
  timeZoneName: "short",
});
const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** "14 Nov 2026, 19:11 CET", Swedish time. */
export function formatDateTime(date: Date): string {
  return dateTime.format(date);
}

/** "2026-11-20" as "20 Nov 2026". */
export function formatDay(isoDay: string): string {
  return day.format(new Date(`${isoDay}T00:00:00Z`));
}

/** "90 s", "2 min 5 s". */
export function formatSeconds(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s} s`;
  const rest = s % 60;
  return rest ? `${Math.floor(s / 60)} min ${rest} s` : `${s / 60} min`;
}

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();
