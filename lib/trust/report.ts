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
  MatchingSummary,
  PrivacySummary,
  ProfileAccuracySummary,
  QuoteCheckSummary,
  RedTeamSummary,
  StaffSessionResults,
  TIMED_TASKS,
  TimedTestResults,
  type AccuracyGroup,
  type TimedTask,
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
export const TRUST_EVAL_KINDS = ["profile_accuracy", "quote_check", "link_check", "matching", "red_team", "privacy"] as const;
export type TrustEvalKind = (typeof TRUST_EVAL_KINDS)[number];

export type EvalRunRow = { kind: string; ranAt: Date; summary: unknown };

/** The latest stored run of one eval. */
export type Run<T> =
  | { status: "measured"; ranAt: Date; summary: T }
  | { status: "not_measured" }
  | { status: "unreadable"; ranAt: Date; problem: string };

/** A results file the team writes by hand. Absent: not measured yet. */
export type FileResult<T> = { status: "measured"; date: string; data: T } | { status: "not_measured" } | { status: "unreadable"; problem: string };

/**
 * Ranked matches (in a company's top 20 now) per mode, counted over the rows
 * the viewer may read: what lib/eval/matching.ts countRankedMatches() returns.
 */
export type MatchCountRow = {
  mode: MatchMode;
  /** Companies with at least one ranked match in this mode. */
  companies: number;
  ranked: number;
  /** Ranked matches the judge has read. */
  judged: number;
  rejected: number;
  lastJudgedAt: Date | null;
};

/** One ranking mode as the report shows it: ranked = kept + rejected + not judged yet. */
export type MatchingModeRow = {
  mode: MatchMode;
  companies: number;
  ranked: number;
  judged: number;
  kept: number;
  rejected: number;
  notJudgedYet: number;
};

export type MatchingResult =
  | {
      status: "measured";
      /**
       * - all_members: the latest stored `matching` eval, every member, both rankings.
       * - all_members_public / own_company: no such eval yet, so the viewer's own
       *   count under row-level security: staff count every member's public
       *   ranking, a member its own company only.
       */
      scope: "all_members" | "all_members_public" | "own_company";
      /** When the eval counted; null for the viewer's own count, which is counted as the page loads. */
      countedAt: Date | null;
      /** The latest judgement among the matches counted; null when none is judged. */
      lastJudgedAt: Date | null;
      /** The public ranking first. */
      modes: MatchingModeRow[];
    }
  | { status: "unreadable"; ranAt: Date; problem: string }
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
  /** The viewer's own count, used while no `matching` eval is stored. */
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
    matching: matchingResult(input.role, input.evalRuns, input.matches),
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

/**
 * The matching numbers: the latest stored `matching` eval (every member), or,
 * while there is none, the viewer's own count (`own`, row-level security).
 */
export function matchingResult(role: AppRole, runs: EvalRunRow[], own: MatchCountRow[]): MatchingResult {
  const run = readRun(runs, "matching", MatchingSummary);
  if (run.status === "unreadable") return run;
  if (run.status === "measured") {
    return {
      status: "measured",
      scope: "all_members",
      countedAt: run.ranAt,
      lastJudgedAt: latest(run.summary.modes.map((m) => (m.lastJudgedAt ? new Date(m.lastJudgedAt) : null))),
      modes: publicFirst(run.summary.modes).map(({ mode, companies, ranked, judged, kept, rejected, notJudgedYet }) => ({
        mode,
        companies,
        ranked,
        judged,
        kept,
        rejected,
        notJudgedYet,
      })),
    };
  }
  const lastJudgedAt = latest(own.map((r) => r.lastJudgedAt));
  if (!lastJudgedAt) return { status: "not_measured" };
  return {
    status: "measured",
    scope: role === "staff" ? "all_members_public" : "own_company",
    countedAt: null,
    lastJudgedAt,
    modes: publicFirst(own).map((r) => ({
      mode: r.mode,
      companies: r.companies,
      ranked: r.ranked,
      judged: r.judged,
      kept: r.judged - r.rejected,
      rejected: r.rejected,
      notJudgedYet: r.ranked - r.judged,
    })),
  };
}

/** Public first: it is the ranking both staff and members can read. */
const publicFirst = <T extends { mode: MatchMode }>(rows: readonly T[]) => [...rows].sort((a, b) => (a.mode === b.mode ? 0 : a.mode === "public" ? -1 : 1));

const latest = (dates: (Date | null)[]): Date | null => {
  const times = dates.filter((d): d is Date => d !== null).map((d) => d.getTime());
  return times.length ? new Date(Math.max(...times)) : null;
};

/** False until the team has given at least one gold claim a verdict. */
export function handCheckStarted(summary: ProfileAccuracySummary): boolean {
  return summary.total.all.checked > 0;
}

/** One accuracy cell: "80% (4 of 5 checked)", or "not measured yet" while nothing in the group is checked. */
export function accuracyText(group: AccuracyGroup): string {
  if (group.checked === 0 || group.accuracy === null) return NOT_MEASURED;
  return `${Math.round(group.accuracy * 100)}% (${group.right} of ${group.checked} checked)`;
}

/** One run of the timed test, as the report shows it. */
export type TimedRun = { seconds: number; completed: boolean; found: number; points: number };

/** One task done by one tester: by hand and with the tool side by side; null when that run is not in the file. */
export type TimedTaskRow = {
  task: TimedTask;
  participant: string;
  /** Items that count in the confirmed answer key for this task, when the file gives it. */
  keyItems: number | null;
  byHand: TimedRun | null;
  withTool: TimedRun | null;
};

/** Per task (A, then B), one row per tester, by hand next to with the tool. */
export function summarizeTimedTest(results: TimedTestResults): TimedTaskRow[] {
  const run = (t: TimedTestResults["trials"][number] | undefined): TimedRun | null =>
    t ? { seconds: t.seconds, completed: t.completed, found: t.found, points: t.points } : null;
  return TIMED_TASKS.flatMap((task) => {
    const trials = results.trials.filter((t) => t.task === task);
    const participants = [...new Set(trials.map((t) => t.participant))].sort(byLabel);
    return participants.map((participant) => {
      const of = (method: "without_app" | "with_app") => trials.find((t) => t.participant === participant && t.method === method);
      return { task, participant, keyItems: results.keyItems?.[task] ?? null, byHand: run(of("without_app")), withTool: run(of("with_app")) };
    });
  });
}

/** "P2" before "P10". */
const byLabel = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });

/** Ratings of one kind: how many were given, and how many were the good answer ("right", "relevant"). */
export type RatingCount = { rated: number; good: number };

/** One gold member's sheets: profile claims right, top-five matches relevant. */
export type MemberRatings = {
  member: string;
  claims: RatingCount & { wrong: number; unsure: number };
  top5: RatingCount & { notRelevant: number };
};

export type StaffSessionSummary = {
  /** In the file's order. */
  members: MemberRatings[];
  /** Over every member. */
  total: Omit<MemberRatings, "member">;
  /** The quotes staff allowed us to use, word for word. */
  quotes: string[];
  /** Quotes written down without permission: counted, never shown. */
  quotesWithheld: number;
};

/** Per gold member, the share of claims rated right and of top-five matches rated relevant, with the number rated. */
export function summarizeStaffSession(results: StaffSessionResults): StaffSessionSummary {
  const members = results.members.map((m): MemberRatings => {
    const claims = (rating: string) => m.claims.filter((c) => c.rating === rating).length;
    const top5 = (rating: string) => m.top5.filter((c) => c.rating === rating).length;
    return {
      member: m.member,
      claims: { rated: m.claims.length, good: claims("right"), wrong: claims("wrong"), unsure: claims("unsure") },
      top5: { rated: m.top5.length, good: top5("relevant"), notRelevant: top5("not_relevant") },
    };
  });
  const sum = (pick: (m: MemberRatings) => number) => members.reduce((n, m) => n + pick(m), 0);
  const quotes = results.quotes ?? [];
  return {
    members,
    total: {
      claims: { rated: sum((m) => m.claims.rated), good: sum((m) => m.claims.good), wrong: sum((m) => m.claims.wrong), unsure: sum((m) => m.claims.unsure) },
      top5: { rated: sum((m) => m.top5.rated), good: sum((m) => m.top5.good), notRelevant: sum((m) => m.top5.notRelevant) },
    },
    quotes: quotes.filter((q) => q.permission).map((q) => q.text),
    quotesWithheld: quotes.filter((q) => !q.permission).length,
  };
}

/** "5 of 7 (71%)"; "not rated" when nothing was rated. */
export function ratingText({ rated, good }: RatingCount): string {
  return rated ? `${good} of ${rated} (${percentOf(good, rated)})` : "not rated";
}

/** One run's cell: "4 min 10 s, 2 of 4 points (3 results given)"; with a gave-up or time-out mark. */
export function timedRunText(run: TimedRun | null, keyItems: number | null): string {
  if (!run) return "not run";
  const time = `${formatSeconds(run.seconds)}${run.completed ? "" : " (not finished)"}`;
  const points = keyItems === null ? `${run.points} ${run.points === 1 ? "point" : "points"}` : `${run.points} of ${keyItems} points`;
  return `${time}, ${points} (${run.found} ${run.found === 1 ? "result" : "results"} given)`;
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
