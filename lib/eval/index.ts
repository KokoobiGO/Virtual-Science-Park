/**
 * The evals `scripts/eval.ts` can run (A21). Each one returns its eval_runs
 * row (kind, summary, details) and a short table for the terminal. Add a new
 * eval by adding an entry here.
 */
import { accuracyTable, profileAccuracy } from "./accuracy";
import { matchingEval, matchingTable } from "./matching";
import { quoteCheck, quoteCheckTable } from "./quote-check";
import { redTeam, redTeamTable } from "./redteam";
import type { EvalResult } from "./result";

export type { EvalResult } from "./result";

export type EvalDefinition = {
  kind: string;
  description: string;
  /** Runs only when named on the command line, not in "all". */
  byNameOnly?: boolean;
  /** Options this eval takes on the command line as --name=value. */
  options?: Record<string, string>;
  /** `partial`: the run covered part of the eval only, so it is printed but not stored. */
  run: (options: Record<string, string>) => Promise<EvalResult & { table: string[]; partial?: boolean }>;
};

export const EVALS: EvalDefinition[] = [
  {
    kind: "profile_accuracy",
    description: "accuracy of the gold profiles against the team's hand-check (data/gold-profiles)",
    run: async () => {
      const result = profileAccuracy();
      return { ...result, table: accuracyTable(result) };
    },
  },
  {
    kind: "quote_check",
    description: "quotes found, fields retried and dropped, from the latest profiling runs",
    run: async () => {
      const result = await quoteCheck();
      return { ...result, table: quoteCheckTable(result) };
    },
  },
  {
    kind: "matching",
    description: "ranked matches over every member per ranking mode: judged, kept, rejected, not judged yet (counts only)",
    run: async () => {
      const result = await matchingEval();
      return { ...result, table: matchingTable(result.summary) };
    },
  },
  {
    kind: "red_team",
    description: "the Copilot red-team prompts (eval/redteam-prompts.json) as real turns for a demo member, pass rate per group",
    byNameOnly: true,
    options: { group: "run one group only (not stored)", case: "run one case id only (not stored)" },
    run: async (options) => {
      const result = await redTeam({ group: options.group, case: options.case });
      return { ...result, table: redTeamTable(result.summary, result.details.cases) };
    },
  },
];
