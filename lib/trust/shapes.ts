/**
 * What the Trust report (C12) reads, as Zod schemas.
 *
 * - The summaries the evals store in eval_runs. The first four mirror what
 *   lib/eval and scripts/check-links.ts write today (only the parts the report
 *   shows); `red_team` and `privacy` are defined here for runs that come later.
 * - The two results files the team writes by hand after a session:
 *   data/timed-test/results.json and data/staff-session/results.json. Each has
 *   a `results.example.json` next to it with this exact shape.
 *
 * A stored summary or file that does not parse is shown as "cannot be read",
 * never guessed at.
 */
import { z } from "zod";

const count = z.number().int().min(0);
const share = z.number().min(0).max(1).nullable();

// ---------------------------------------------------------------------------
// eval_runs summaries written today
// ---------------------------------------------------------------------------

/** `unsure` counts as checked, never as right; runs from before it existed have none. */
const AccuracyGroup = z.object({ claims: count, checked: count, right: count, wrong: count, unsure: count.optional(), unchecked: count, accuracy: share });
const AccuracyBlock = z.object({ stated: AccuracyGroup, inferred: AccuracyGroup, missing: AccuracyGroup, all: AccuracyGroup });
export type AccuracyGroup = z.infer<typeof AccuracyGroup>;

/**
 * kind "profile_accuracy", written by lib/eval/accuracy.ts from the hand-check
 * in data/gold-profiles. Per company, who gave the verdicts: automatedReviewer
 * true means an automated reviewer (AI), not a person, and confirmedByTeam
 * false that no team member has gone through them yet. Runs from before these
 * keys existed have none of them.
 */
export const ProfileAccuracySummary = z.object({
  complete: z.boolean(),
  total: AccuracyBlock,
  companies: z.array(
    AccuracyBlock.extend({
      slug: z.string(),
      company: z.string(),
      checkedBy: z.string().optional(),
      checkedOn: z.iso.date().nullable().optional(),
      automatedReviewer: z.boolean().optional(),
      confirmedByTeam: z.boolean().optional(),
    }),
  ),
});
export type ProfileAccuracySummary = z.infer<typeof ProfileAccuracySummary>;

/**
 * The gold profiles whose verdicts come from an automated reviewer (AI) that
 * no team member has confirmed. The Trust report must say so next to the
 * numbers. Empty when people gave every verdict.
 */
export function automatedReviewCompanies(summary: ProfileAccuracySummary): string[] {
  return summary.companies.filter((c) => c.automatedReviewer && !c.confirmedByTeam).map((c) => c.company);
}

const QuoteRun = z.object({
  slug: z.string(),
  /** When the profiling run stored the profile (ISO). */
  storedAt: z.string(),
  quotesFound: count,
  quotesTotal: count,
  retried: z.array(z.string()),
  dropped: z.array(z.string()),
});
const QuoteTotals = z.object({ runs: count, quotesFound: count, quotesTotal: count, droppedFields: count, profileFields: count });
export type QuoteTotals = z.infer<typeof QuoteTotals>;

/** kind "quote_check", written by lib/eval/quote-check.ts from the latest profiling run per company. */
export const QuoteCheckSummary = z.object({
  gold: z.object({ companies: z.array(QuoteRun), withoutRun: z.array(z.string()), total: QuoteTotals }),
  all: QuoteTotals,
});
export type QuoteCheckSummary = z.infer<typeof QuoteCheckSummary>;

/** kind "link_check", written by scripts/check-links.ts. */
export const LinkCheckSummary = z.object({ checked: count, ok: count, broken: count, blocked: count, unverifiable: count.default(0) });
export type LinkCheckSummary = z.infer<typeof LinkCheckSummary>;

/**
 * kind "matching", written by lib/eval/matching.ts: the ranked matches over
 * every member, per ranking mode (counts only).
 */
export const MatchingSummary = z.object({
  modes: z.array(
    z.object({
      mode: z.enum(["public", "personal"]),
      companies: count,
      ranked: count,
      judged: count,
      kept: count,
      rejected: count,
      notJudgedYet: count,
      lastJudgedAt: z.iso.datetime().nullable(),
    }),
  ),
});
export type MatchingSummary = z.infer<typeof MatchingSummary>;

// ---------------------------------------------------------------------------
// eval_runs summaries for runs that come later
// ---------------------------------------------------------------------------

const passCount = { passed: count, total: count.min(1) };
const withinTotal = (c: { passed: number; total: number }) => c.passed <= c.total;
const WITHIN_TOTAL = { message: "passed cannot be more than total" };

/**
 * kind "red_team": the red-team prompts, in groups (for example "prompt
 * injection" or "eligibility bait"), and how many in each group the system
 * handled as it should.
 *
 *   { "groups": [{ "group": "prompt injection", "passed": 9, "total": 10 }] }
 */
export const RedTeamSummary = z.object({
  groups: z
    .array(z.object({ group: z.string().min(1), ...passCount }).refine(withinTotal, WITHIN_TOTAL))
    .min(1),
});
export type RedTeamSummary = z.infer<typeof RedTeamSummary>;

/**
 * kind "privacy": the row-level security tests (tests/privacy*.test.ts), how
 * many passed of how many ran against the hosted database.
 *
 *   { "passed": 18, "total": 18 }
 */
export const PrivacySummary = z.object(passCount).refine(withinTotal, WITHIN_TOTAL);
export type PrivacySummary = z.infer<typeof PrivacySummary>;

// ---------------------------------------------------------------------------
// Results files
// ---------------------------------------------------------------------------

/** A day, "YYYY-MM-DD". */
const Day = z.iso.date();

/** An anonymous label such as "P1" (tester) or "S1" (staff), never a name. */
const label = (letter: "P" | "S") =>
  z.string().regex(new RegExp(`^${letter}[0-9]+$`), { message: `an anonymous label such as ${letter}1, never a name` });

/** A company slug, as in the sheet's file name (claims-embeddedart.md: "embeddedart"). */
const Slug = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, { message: "a company slug such as embeddedart" });

/** The two timed-test tasks (data/timed-test/answer-key.md). */
export const TIMED_TASKS = ["A", "B"] as const;
export type TimedTask = (typeof TIMED_TASKS)[number];

/** 15 minutes: a run stops there. */
export const TIMED_TEST_LIMIT_SECONDS = 900;

/** Adds an issue for each value that is there twice. */
function noDuplicates<T>(items: readonly T[], key: (item: T) => string, path: (i: number) => PropertyKey[], what: string, ctx: z.RefinementCtx) {
  const seen = new Set<string>();
  items.forEach((item, i) => {
    const k = key(item);
    if (seen.has(k)) ctx.addIssue({ code: "custom", path: path(i), message: `${what} is there twice` });
    seen.add(k);
  });
}

/**
 * data/timed-test/results.json: the timed test, from the record sheets
 * (data/timed-test/record-sheet.md, one sheet per run). How to fill it in:
 * data/timed-test/README.md.
 *
 * - date: the day of the session.
 * - keyItems: optional, per task, how many items count in the confirmed
 *   answer key (believed correct, plus the unsure items ticked "counts"), so
 *   the report can say "2 of 4 points".
 * - trials: one per record sheet. `participant` is the tester's anonymous
 *   label; `task` A or B; `method` without_app (by hand) or with_app (with the
 *   tool); `seconds` the time used, 900 at most; `completed` false when the
 *   tester gave up or the 15 minutes ran out; `found` the results the tester
 *   gave; `points` the correct ones (one point per correct result within 15
 *   minutes). One trial per tester, task and method.
 * - notes: optional, anything a reader needs to weigh the numbers.
 */
export const TimedTestResults = z
  .strictObject({
    date: Day,
    keyItems: z.strictObject({ A: count.min(1).optional(), B: count.min(1).optional() }).optional(),
    trials: z
      .array(
        z
          .strictObject({
            participant: label("P"),
            task: z.enum(TIMED_TASKS),
            method: z.enum(["without_app", "with_app"]),
            seconds: z.number().int().min(0).max(TIMED_TEST_LIMIT_SECONDS),
            completed: z.boolean(),
            found: count,
            points: count,
            note: z.string().optional(),
          })
          .refine((t) => t.points <= t.found, { message: "points cannot be more than the results found", path: ["points"] }),
      )
      .min(1),
    notes: z.string().optional(),
  })
  .superRefine((results, ctx) => {
    noDuplicates(results.trials, (t) => `${t.participant}|${t.task}|${t.method}`, (i) => ["trials", i], "the same tester, task and method", ctx);
    results.trials.forEach((t, i) => {
      const max = results.keyItems?.[t.task];
      if (max !== undefined && t.points > max) {
        ctx.addIssue({ code: "custom", path: ["trials", i, "points"], message: `points cannot be more than keyItems.${t.task} (${max})` });
      }
    });
  });
export type TimedTestResults = z.infer<typeof TimedTestResults>;

const Rater = label("S").optional();

/**
 * data/staff-session/results.json: the staff session, from the rating sheets
 * in data/staff-session/ (claims-<slug>.md, top5-<slug>.md, think-aloud.md).
 * How to fill it in: data/staff-session/README.md.
 *
 * - date: the day of the session.
 * - staff: how many BSP staff took part.
 * - members: one per gold member rated. `member` is the slug from the sheet's
 *   file name. `claims`: one per ticked box on its claims sheet, `claim` the
 *   number in the heading ("## 2. Offerings" is 2), `rating` right, wrong or
 *   unsure. `top5`: one per ticked box on its top-five sheet, `match` the
 *   number in the heading (1 to 5), `rating` relevant or not_relevant.
 *   `rater` ("S1") only when more than one person rated the same sheet.
 * - quotes: the exact quotes from the think-aloud sheet, each with
 *   `permission` true only when the box "yes" was ticked. The report shows
 *   only those.
 * - notes: optional, anything a reader needs to weigh the numbers.
 */
export const StaffSessionResults = z
  .strictObject({
    date: Day,
    staff: z.number().int().positive(),
    members: z
      .array(
        z
          .strictObject({
            member: Slug,
            claims: z.array(
              z.strictObject({ claim: z.number().int().positive(), rating: z.enum(["right", "wrong", "unsure"]), rater: Rater, note: z.string().optional() }),
            ),
            top5: z.array(
              z.strictObject({ match: z.number().int().min(1).max(5), rating: z.enum(["relevant", "not_relevant"]), rater: Rater, note: z.string().optional() }),
            ),
          })
          .superRefine((m, ctx) => {
            noDuplicates(m.claims, (c) => `${c.claim}|${c.rater ?? ""}`, (i) => ["claims", i], "the same claim from the same rater", ctx);
            noDuplicates(m.top5, (c) => `${c.match}|${c.rater ?? ""}`, (i) => ["top5", i], "the same match from the same rater", ctx);
          }),
      )
      .min(1),
    quotes: z.array(z.strictObject({ text: z.string().trim().min(1), permission: z.boolean() })).optional(),
    notes: z.string().optional(),
  })
  .superRefine((results, ctx) => {
    noDuplicates(results.members, (m) => m.member, (i) => ["members", i, "member"], "the same member", ctx);
  });
export type StaffSessionResults = z.infer<typeof StaffSessionResults>;
