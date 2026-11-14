/**
 * The evals `scripts/eval.ts` can run (A21). Each one returns its eval_runs
 * row (kind, summary, details) and a short table for the terminal. Add a new
 * eval (the red-team run, say) by adding an entry here.
 */
import { accuracyTable, profileAccuracy } from "./accuracy";
import { quoteCheck, quoteCheckTable } from "./quote-check";
import type { EvalResult } from "./result";

export type { EvalResult } from "./result";

export type EvalDefinition = {
  kind: string;
  description: string;
  run: () => Promise<EvalResult & { table: string[] }>;
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
];
