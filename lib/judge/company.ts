/**
 * Judge one company's ranked matches (A16), the same way from the job and the
 * script. `run` wraps every unit of work: the judge-company job passes
 * step.run, so each model call is its own step; the script runs them directly.
 * Everything that reads the database or calls the model happens inside `run`,
 * so the job's replays see the same plan.
 *
 * 1. Public rows, five per call, from the public profile text only.
 * 2. Personal rows: a copy of the public judgement when the company has no
 *    private data, otherwise five per call from the personal text.
 * 3. A batch whose answer fails a check is asked once more with the reasons;
 *    entries that fail again stay unjudged for a later run.
 * 4. If anything was rejected, the ranking is stored again (rejected rows
 *    leave the pool, so the top 20 fills up) and the new unjudged rows are
 *    judged in one more round. No third round.
 *
 * With `dry`, nothing is stored and there is no second round.
 */
import { NvidiaApiError } from "../nvidia";
import { rankAndStore, type RankAndStoreResult } from "../matcher/store";
import type { MatchMode } from "../schemas";
import { emptyJudgeUsage, JUDGE_BATCH, judgeBatch, type JudgeUsage } from "./index";
import { planPersonal } from "./personal";
import { matchPromptId, type JudgeOpportunity } from "./prompt";
import { loadJudgeWork, storeJudgements, type JudgeRow, type JudgeWork } from "./store";
import { retryFeedback, type CheckedEntry, type FailedEntry, type Judgement } from "./verify";

/** Runs one named unit of work. The job passes step.run; the script calls `work` directly. */
export type StepRunner = <T>(name: string, work: () => Promise<T>) => Promise<T>;

export const runDirectly: StepRunner = (_name, work) => work();

export const isRateLimit = (error: unknown) => error instanceof NvidiaApiError && error.status === 429;

/** One judged (or failed) row, for the run's output and the script's print. */
export type JudgedLine = {
  round: number;
  mode: MatchMode;
  rank: number;
  kind: string;
  source: string;
  title: string;
  /** "unjudged": failed twice; stays for a later run. */
  verdict: "keep" | "reject" | "unjudged";
  copied: boolean;
  why: string | null;
  nextStep: string | null;
  uncertainties: string[];
  rejectionReason: string | null;
  /** For "unjudged": what was wrong the last time. */
  problems: string[];
};

export type JudgeCompanyResult = {
  slug: string;
  name: string;
  privateData: boolean;
  dry: boolean;
  rounds: number;
  /** Rows the model judged (and the checks passed). */
  judged: number;
  /** Personal rows that got a copy of the public judgement. */
  copied: number;
  /** Over judged and copied rows. */
  kept: number;
  rejected: number;
  /** Rows that failed twice and stay unjudged. */
  failed: number;
  /** Batches asked a second time. */
  retries: number;
  /** Why each retry was asked, as "M2: problem" lines, per batch. */
  retryReasons: { batch: string; problems: string[] }[];
  usage: JudgeUsage;
  /** Seconds the model took, over all calls. */
  modelSeconds: number;
  refill: Pick<RankAndStoreResult, "personal" | "public"> | null;
  lines: JudgedLine[];
};

export type JudgeCompanyOptions = {
  force?: boolean;
  dry?: boolean;
  run?: StepRunner;
  model?: string;
  /** "Today" in the prompt. Default: now. */
  today?: Date;
};

type BatchOutcome = { accepted: CheckedEntry[]; failed: FailedEntry[]; usage: JudgeUsage; seconds: number; apiError: string | null };

const lineOf = (round: number, row: JudgeRow, judgement: Judgement, copied: boolean): JudgedLine => ({
  round,
  mode: row.mode,
  rank: row.rank,
  kind: row.kind,
  source: row.source,
  title: row.title,
  verdict: judgement.rejected ? "reject" : "keep",
  copied,
  why: judgement.why,
  nextStep: judgement.nextStep,
  uncertainties: judgement.uncertainties,
  rejectionReason: judgement.rejectionReason,
  problems: [],
});

const toPrompt = (row: JudgeRow, id: string): JudgeOpportunity => ({
  id,
  title: row.title,
  kind: row.kind,
  source: row.source,
  deadline: row.deadline,
  eventDate: row.eventDate,
  tags: row.tags,
  sharedAreas: row.matchedOn,
  contact: row.contact,
  eligibilityText: row.eligibilityText,
  description: row.description,
});

export async function judgeCompany(slug: string, options: JudgeCompanyOptions = {}): Promise<JudgeCompanyResult> {
  const { force = false, dry = false, run = runDirectly, model, today } = options;
  const first = await run("load", () => loadJudgeWork(slug, { force }));
  const result: JudgeCompanyResult = {
    slug: first.company.slug,
    name: first.company.name,
    privateData: first.privateData,
    dry,
    rounds: 0,
    judged: 0,
    copied: 0,
    kept: 0,
    rejected: 0,
    failed: 0,
    retries: 0,
    retryReasons: [],
    usage: emptyJudgeUsage(),
    modelSeconds: 0,
    refill: null,
    lines: [],
  };

  const record = (round: number, row: JudgeRow, judgement: Judgement, copied: boolean) => {
    if (copied) result.copied++;
    else result.judged++;
    if (judgement.rejected) result.rejected++;
    else result.kept++;
    result.lines.push(lineOf(round, row, judgement, copied));
  };

  const addUsage = (outcome: BatchOutcome) => {
    result.usage.calls += outcome.usage.calls;
    result.usage.inputTokens += outcome.usage.inputTokens;
    result.usage.outputTokens += outcome.usage.outputTokens;
    result.modelSeconds = Math.round((result.modelSeconds + outcome.seconds) * 10) / 10;
  };

  /** One model call as one unit of work: judge, then store what passed (unless dry). */
  const batch = (label: string, profile: { name: string; profileText: string }, items: { id: string; row: JudgeRow }[], feedback?: string) =>
    run(label, async (): Promise<BatchOutcome> => {
      const started = Date.now();
      try {
        const out = await judgeBatch(
          profile,
          items.map(({ id, row }) => toPrompt(row, id)),
          { model, feedback, today },
        );
        if (!dry) {
          const byId = new Map(items.map((item) => [item.id, item.row]));
          await storeJudgements(out.accepted.map((a) => ({ matchId: byId.get(a.id)!.matchId, judgement: a.judgement })));
        }
        return { accepted: out.accepted, failed: out.failed, usage: out.usage, seconds: out.seconds, apiError: null };
      } catch (error) {
        // A rate limit goes to the runner, which waits and tries again; anything else fails this batch only.
        if (isRateLimit(error)) throw error;
        const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        return {
          accepted: [],
          failed: items.map(({ id }) => ({ id, problems: [`The call failed: ${message.slice(0, 200)}`] })),
          usage: { calls: 1, inputTokens: 0, outputTokens: 0 },
          seconds: Math.round((Date.now() - started) / 100) / 10,
          apiError: message.slice(0, 300),
        };
      }
    });

  /** Judges rows of one mode, five per call, each failed batch asked once more. Returns what passed, by row. */
  const judgeRows = async (round: number, mode: MatchMode, profileText: string, rows: JudgeRow[]) => {
    const passed: { row: JudgeRow; judgement: Judgement }[] = [];
    const failedIds: string[] = [];
    const profile = { name: first.company.name, profileText };
    for (let start = 0; start < rows.length; start += JUDGE_BATCH) {
      const items = rows.slice(start, start + JUDGE_BATCH).map((row, i) => ({ id: matchPromptId(i), row }));
      const byId = new Map(items.map((item) => [item.id, item.row]));
      const label = `round ${round} ${mode} ${start + 1}-${start + items.length}`;

      const firstTry = await batch(label, profile, items);
      addUsage(firstTry);
      let accepted = firstTry.accepted;
      let failed = firstTry.failed;
      if (failed.length) {
        result.retries++;
        result.retryReasons.push({ batch: label, problems: failed.map((f) => `${byId.get(f.id)!.title.slice(0, 60)}: ${f.problems.join(" ")}`) });
        // An API error has no answer to correct: ask again without feedback.
        const again = await batch(
          `${label} retry`,
          profile,
          items.filter((item) => failed.some((f) => f.id === item.id)),
          firstTry.apiError ? undefined : retryFeedback(failed),
        );
        addUsage(again);
        accepted = [...accepted, ...again.accepted];
        failed = again.failed;
      }
      for (const a of accepted) {
        passed.push({ row: byId.get(a.id)!, judgement: a.judgement });
        record(round, byId.get(a.id)!, a.judgement, false);
      }
      for (const f of failed) {
        const row = byId.get(f.id)!;
        failedIds.push(row.matchId);
        result.failed++;
        result.lines.push({ ...lineOf(round, row, { rejected: false, why: null, nextStep: null, uncertainties: [], rejectionReason: null }, false), verdict: "unjudged", problems: f.problems });
      }
    }
    return { passed, failedIds };
  };

  const judgeRound = async (round: number, work: JudgeWork, skip: ReadonlySet<string>) => {
    result.rounds = round;
    const failedIds: string[] = [];
    const pub = await judgeRows(
      round,
      "public",
      work.publicText,
      work.public.filter((r) => !skip.has(r.matchId)),
    );
    failedIds.push(...pub.failedIds);

    const publicJudgements = new Map(work.storedPublic.map((s) => [s.opportunityId, s.judgement]));
    for (const p of pub.passed) publicJudgements.set(p.row.opportunityId, p.judgement);
    const personalRows = work.personal.filter((r) => !skip.has(r.matchId));
    const plan = planPersonal({ privateData: work.privateData, rows: personalRows, publicJudgements });
    if (plan.copies.length) {
      await run(`round ${round} copy personal`, async () => (dry ? 0 : storeJudgements(plan.copies)));
      const rowsById = new Map(personalRows.map((r) => [r.matchId, r]));
      for (const copy of plan.copies) record(round, rowsById.get(copy.matchId)!, copy.judgement, true);
    }
    const per = await judgeRows(round, "personal", work.personalText, plan.toJudge);
    failedIds.push(...per.failedIds);
    return failedIds;
  };

  const failedFirst = await judgeRound(1, first, new Set());
  if (dry || result.rejected === 0) return result;

  // Rejected rows leave the pool: rank again so the top 20 fills up, then judge the newcomers once.
  const refill = await run("refill ranking", () => rankAndStore(first.company.id));
  result.refill = { personal: refill.personal, public: refill.public };
  const second = await run("round 2 load", () => loadJudgeWork(slug));
  // Rows that failed twice in round 1 wait for a later run.
  const skip = new Set(failedFirst);
  if (second.public.some((r) => !skip.has(r.matchId)) || second.personal.some((r) => !skip.has(r.matchId))) {
    await judgeRound(2, second, skip);
  }
  return result;
}
