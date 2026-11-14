/**
 * The connection finder's steps (A28), shared by the find-connections job and
 * `scripts/connections.ts`: list the candidates (candidates.ts), judge a few
 * pairs at a time (this file), store what passed (store.ts).
 */
import { loadPublicClaims } from "./claims";
import type { CandidatePair } from "./candidates";
import { judgePair, JUDGE_TIMEOUT_MS } from "./judge";
import { judgeClaims } from "./prompt";
import type { ConnectionToStore } from "./store";
import { verifyJudgement, type ConnectionEvidence, type VerifyCheck } from "./verify";

/** Pairs judged at once, in parallel: one job step, under Netlify's 30 s. */
export const PAIRS_PER_STEP = 2;

export type PairVerdict = {
  companyAId: string;
  companyBId: string;
  companyAName: string;
  companyBName: string;
  similarity: number;
  /**
   * passed: stored. rejected: the judge said no. failed: a check after the
   * answer failed, or the answer did not fit the schema. skipped: a company has
   * no public claim the judge reads, so no call was made.
   */
  outcome: "passed" | "rejected" | "failed" | "skipped";
  /** The failed check, or "output" for an answer that did not fit the schema. */
  check: VerifyCheck | "output" | null;
  /** Why the pair was not stored. */
  reason: string | null;
  basis: string;
  sharedOn: string[];
  evidence: ConnectionEvidence[];
  /** The model's cited short ids, for the log. */
  cited: { A: string[]; B: string[] };
  seconds: number;
  usage: { inputTokens: number; outputTokens: number };
};

export type JudgeCandidatesOptions = {
  model?: string;
  /** When the last call must have answered (ms since the epoch). Default: 26 s from now. */
  deadline?: number;
};

/**
 * Judges these pairs in parallel, each in its own model call, and checks each
 * answer. API errors (a 429, a timeout) are thrown, so the caller can try the
 * pairs again later.
 */
export async function judgeCandidates(pairs: readonly CandidatePair[], options: JudgeCandidatesOptions = {}): Promise<PairVerdict[]> {
  const deadline = options.deadline ?? Date.now() + JUDGE_TIMEOUT_MS;
  const claimsByCompany = await loadPublicClaims([...new Set(pairs.flatMap((p) => [p.companyAId, p.companyBId]))]);

  return Promise.all(
    pairs.map(async (pair): Promise<PairVerdict> => {
      const base = {
        companyAId: pair.companyAId,
        companyBId: pair.companyBId,
        companyAName: pair.companyAName,
        companyBName: pair.companyBName,
        similarity: pair.similarity,
        basis: "",
        sharedOn: [],
        evidence: [],
        cited: { A: [], B: [] },
        seconds: 0,
        usage: { inputTokens: 0, outputTokens: 0 },
      };
      const a = { id: pair.companyAId, name: pair.companyAName, claims: claimsByCompany.get(pair.companyAId) ?? [] };
      const b = { id: pair.companyBId, name: pair.companyBName, claims: claimsByCompany.get(pair.companyBId) ?? [] };
      const empty = [a, b].find((c) => !judgeClaims(c.claims).length);
      if (empty) return { ...base, outcome: "skipped", check: null, reason: `${empty.name} has no public claim in the judged fields` };

      const run = await judgePair(a, b, { model: options.model, timeoutMs: Math.max(1_000, deadline - Date.now()) });
      const judged = { ...base, seconds: run.seconds, usage: run.usage };
      if (!run.answer) return { ...judged, outcome: "failed", check: "output", reason: run.error };

      const answered = { ...judged, cited: { A: run.answer.claimsA, B: run.answer.claimsB } };
      const result = verifyJudgement(run.answer, run.shown, pair);
      if (!result.ok) {
        const outcome = result.check === "plausible" ? "rejected" : "failed";
        return { ...answered, basis: run.answer.basis, sharedOn: run.answer.sharedOn, outcome, check: result.check, reason: result.reason };
      }
      return { ...answered, ...result.connection, outcome: "passed", check: null, reason: null };
    }),
  );
}

/** The verdicts that passed, as rows to store. */
export function connectionsToStore(verdicts: readonly PairVerdict[]): ConnectionToStore[] {
  return verdicts
    .filter((v) => v.outcome === "passed")
    .map((v) => ({ companyAId: v.companyAId, companyBId: v.companyBId, score: v.similarity, basis: v.basis, sharedOn: v.sharedOn, evidence: v.evidence }));
}

export type FindSummary = {
  candidates: number;
  judged: number;
  plausible: number;
  passed: number;
  rejected: number;
  failed: number;
  skipped: number;
  /** Failed pairs by check. */
  failedChecks: Partial<Record<VerifyCheck | "output", number>>;
  tokens: { input: number; output: number };
};

export function summarize(verdicts: readonly PairVerdict[]): FindSummary {
  const count = (outcome: PairVerdict["outcome"]) => verdicts.filter((v) => v.outcome === outcome).length;
  const failedChecks: FindSummary["failedChecks"] = {};
  for (const v of verdicts) if (v.outcome === "failed" && v.check) failedChecks[v.check] = (failedChecks[v.check] ?? 0) + 1;
  return {
    candidates: verdicts.length,
    judged: verdicts.length - count("skipped"),
    // Every answer that said yes, whether or not it then passed the checks.
    plausible: verdicts.filter((v) => v.outcome === "passed" || (v.outcome === "failed" && v.check !== "output")).length,
    passed: count("passed"),
    rejected: count("rejected"),
    failed: count("failed"),
    skipped: count("skipped"),
    failedChecks,
    tokens: {
      input: verdicts.reduce((sum, v) => sum + v.usage.inputTokens, 0),
      output: verdicts.reduce((sum, v) => sum + v.usage.outputTokens, 0),
    },
  };
}
