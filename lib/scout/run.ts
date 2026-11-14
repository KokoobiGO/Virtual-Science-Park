/**
 * One Scout brief from its `briefs` row, the same way from the scout-brief job
 * and from scripts/scout.ts: load the row and the company's profile, run the
 * agent with the real search, page reader and storage, and write the result
 * to the row. Jobs and scripts only (getDb()).
 */
import { isCachedMode } from "../collectors/cache";
import type { OpportunityKind } from "../schemas";
import { runDirectly, runScout, type ScoutLimits, type ScoutResult, type StepRunner } from "./agent";
import { readPage } from "./read-page";
import { searchStore, searchWeb } from "./search";
import { loadBriefWork, saveDone, saveFailed, saveProgress, type BriefWork } from "./store";
import type { ProgressStep } from "./types";

export type ScoutBriefOptions = {
  run?: StepRunner;
  model?: string;
  limits?: Partial<ScoutLimits>;
  /** Called with the new progress lines as they are stored, e.g. to print them. */
  onProgress?: (lines: ProgressStep[]) => void;
};

export type ScoutBriefOutcome =
  | { skipped: true; briefId: string; status: BriefWork["status"] }
  | ({ skipped: false; briefId: string; company: BriefWork["company"]; startedAt: number } & ScoutResult);

export async function runScoutBrief(briefId: string, options: ScoutBriefOptions = {}): Promise<ScoutBriefOutcome> {
  const run = options.run ?? runDirectly;
  const work = await run("load", () => loadBriefWork(briefId));
  if (work.status !== "running") return { skipped: true, briefId, status: work.status };

  let shown = 0;
  const report = (progress: ProgressStep[]) => {
    options.onProgress?.(progress.slice(shown));
    shown = progress.length;
  };

  const result = await runScout(
    { question: work.question, company: work.company, profileText: work.profileText, startedAt: work.startedAt, createdAt: work.createdAt },
    {
      run,
      model: options.model,
      limits: options.limits,
      searchStore: (query: string, kind?: OpportunityKind) => searchStore(query, { kind, companyId: work.company.id }),
      // Cached mode reads nothing live: no web search.
      searchWeb: isCachedMode() ? null : (query: string) => searchWeb(query),
      readPage: (url: string) => readPage(url),
      saveProgress: async (progress) => {
        await saveProgress(briefId, progress);
        report(progress);
      },
      saveDone: async (brief, progress, searches) => {
        await saveDone(briefId, brief, progress, searches);
        report(progress);
      },
      saveFailed: async (error, progress, searches) => {
        await saveFailed(briefId, error, progress, searches);
        report(progress);
      },
    },
  );
  return { skipped: false, briefId, company: work.company, startedAt: work.startedAt, ...result };
}
