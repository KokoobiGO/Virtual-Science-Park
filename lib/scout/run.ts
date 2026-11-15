/**
 * One Scout brief from its `briefs` row, the same way from the scout-brief job
 * and from scripts/scout.ts: load the row and the company's profile, run the
 * agent with the real search, page reader and storage, and write the result
 * to the row. Jobs and scripts only (getDb()).
 */
import { isCachedMode } from "../collectors/cache";
import type { OpportunityKind } from "../schemas";
import { runDirectly, runScout, type ScoutDeps, type ScoutLimits, type ScoutResult, type StepRunner } from "./agent";
import { checkCitedLinks } from "./link-check";
import { searchLive } from "./live-sources";
import { readPage } from "./read-page";
import { searchStore } from "./search";
import { loadBriefWork, saveDone, saveFailed, saveProgress, type BriefWork } from "./store";
import type { ProgressStep } from "./types";
import { searchWeb, webProviderFromEnv } from "./web-search";

/**
 * The real search sources for one run: the store (personal ranking for the
 * company), the live sources and the keyed web provider. Cached mode reads
 * nothing live, so both outside sources are off.
 */
export function realSearch(companyId: string): Pick<ScoutDeps, "searchStore" | "searchLive" | "searchWeb"> {
  const cached = isCachedMode();
  const provider = webProviderFromEnv();
  return {
    searchStore: (query: string, kind?: OpportunityKind) => searchStore(query, { kind, companyId }),
    searchLive: cached ? null : (query: string, kind?: OpportunityKind) => searchLive(query, { kind }),
    searchWeb: cached ? null : (query: string) => searchWeb(query, { provider }),
  };
}

/** The live check of cited links before a brief is stored. Off in cached mode, which reads nothing live. */
export function realLinkCheck(): ScoutDeps["checkLinks"] {
  return isCachedMode() ? null : (urls: string[]) => checkCitedLinks(urls);
}

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
      ...realSearch(work.company.id),
      readPage: (url: string) => readPage(url),
      checkLinks: realLinkCheck(),
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
