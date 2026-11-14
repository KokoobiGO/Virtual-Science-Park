/**
 * What the Trust report (C12) reads, as Zod schemas.
 *
 * - The summaries the evals store in eval_runs. The first three mirror what
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

const AccuracyGroup = z.object({ claims: count, checked: count, right: count, wrong: count, unchecked: count, accuracy: share });
const AccuracyBlock = z.object({ stated: AccuracyGroup, inferred: AccuracyGroup, missing: AccuracyGroup, all: AccuracyGroup });
export type AccuracyGroup = z.infer<typeof AccuracyGroup>;

/** kind "profile_accuracy", written by lib/eval/accuracy.ts from the team's hand-check. */
export const ProfileAccuracySummary = z.object({
  complete: z.boolean(),
  total: AccuracyBlock,
  companies: z.array(AccuracyBlock.extend({ slug: z.string(), company: z.string() })),
});
export type ProfileAccuracySummary = z.infer<typeof ProfileAccuracySummary>;

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
export const LinkCheckSummary = z.object({ checked: count, ok: count, broken: count, blocked: count });
export type LinkCheckSummary = z.infer<typeof LinkCheckSummary>;

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

/**
 * data/timed-test/results.json: one session in which members did the same
 * task with the app and without it (their usual search), against the clock.
 *
 * - date: the day of the session.
 * - task: what every participant was asked to do, word for word.
 * - trials: one entry per participant and method. `participant` is an
 *   anonymous label ("P1"), never a name. `seconds` is the time until the
 *   participant said "done" or gave up; `completed` is false when they gave up
 *   or ran out of time.
 * - notes: optional, anything a reader needs to weigh the numbers.
 */
export const TimedTestResults = z.strictObject({
  date: Day,
  task: z.string().min(1),
  trials: z
    .array(
      z.strictObject({
        participant: z.string().min(1),
        method: z.enum(["with_app", "without_app"]),
        seconds: z.number().positive(),
        completed: z.boolean(),
      }),
    )
    .min(1),
  notes: z.string().optional(),
});
export type TimedTestResults = z.infer<typeof TimedTestResults>;

/**
 * data/staff-session/results.json: one session in which BSP staff looked at
 * what the system suggests and rated each item.
 *
 * - date: the day of the session.
 * - staff: how many BSP staff took part.
 * - ratings: one entry per item rated. `kind` is a suggested match, a
 *   suggested connection between two members, or a company profile. `item`
 *   says which one in a few words. `verdict` is the staff's: useful, not
 *   useful, or unsure. `comment` is optional.
 * - notes: optional, anything a reader needs to weigh the numbers.
 */
export const StaffSessionResults = z.strictObject({
  date: Day,
  staff: z.number().int().positive(),
  ratings: z
    .array(
      z.strictObject({
        kind: z.enum(["match", "connection", "profile"]),
        item: z.string().min(1),
        verdict: z.enum(["useful", "not_useful", "unsure"]),
        comment: z.string().optional(),
      }),
    )
    .min(1),
  notes: z.string().optional(),
});
export type StaffSessionResults = z.infer<typeof StaffSessionResults>;
