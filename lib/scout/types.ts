/**
 * Scout's shared shapes (B1, B3, B4): what a search returns, what a brief
 * holds, and how both sit in the `briefs` row.
 *
 * `briefs` has no column for progress, so the jsonb column `brief` holds both:
 * `{ progress, result }`. `result` stays null while the run is going and when
 * it fails. Zod parses it on the way out, because a request reads it back.
 */
import { z } from "zod";
import { OpportunityKind, SourceState } from "../schemas";

/** The adapter interface every search source answers with (B1). */
export type SearchHit = { title: string; url: string; snippet: string };

/**
 * Where a hit came from: BSP's own opportunity store, a funder's own search
 * asked live during the run (live-sources.ts), or a keyed web search
 * (web-search.ts). Briefs stored before "live" existed only hold the first two.
 */
export const SourceOrigin = z.enum(["store", "web", "live"]);
export type SourceOrigin = z.infer<typeof SourceOrigin>;

/** A hit with what the source knows about it. Dates are ISO strings: job steps pass JSON. */
export type ScoutHit = SearchHit & {
  origin: SourceOrigin;
  /** When the text was retrieved: the collector's fetch for store rows, the search for live and web hits. */
  retrievedAt: string;
  opportunityId?: string | null;
  kind?: OpportunityKind | null;
  /** Display name of the source, e.g. "Vinnova". For live hits the collector's label, so they compare with store rows. */
  sourceName?: string | null;
  /** Live and web hits: the search that answered, e.g. "EU Funding & Tenders portal" or "Tavily web search". */
  liveSource?: string | null;
  /** Live hits: the source's own id (EU topic identifier, Vinnova diarienummer, page path), to match store rows. */
  externalId?: string | null;
  /** Live and web hits: INJECTION_LABEL when the text looks like instructions to an AI (lib/injection/detect.ts). */
  injection?: string | null;
  opensAt?: string | null;
  deadline?: string | null;
  eventDate?: string | null;
  contact?: string | null;
  eligibilityText?: string | null;
  /** The longer text the writer reads (store rows); the snippet is a cut of it. */
  description?: string | null;
  /** Store rows: typed in by the team (opportunities.simulated), for the data status label (D20). */
  simulated?: boolean;
  /** Store rows: the source's state (source_status.state, matched on its label). */
  sourceState?: SourceState | null;
  /** Store rows from a cached source: when its recorded copy was taken (ISO). */
  sourceCachedAt?: string | null;
};

/**
 * One page read during the run (read_page). `stored` is true when the text is
 * the latest stored snapshot (DEMO_MODE=cached), not a fresh read; then
 * `retrievedAt` is the date of that copy.
 */
export type PageRead = { url: string; title: string | null; text: string; retrievedAt: string; chars: number; stored?: boolean };

/** A source as the run knows it: a hit with its short id (R1, R2, ...) and the page text when it was read. */
export type SourceRecord = ScoutHit & { id: string; page: PageRead | null };

export const ProgressKind = z.enum(["start", "search", "web", "read", "plan", "write", "check", "done", "error"]);
export type ProgressKind = z.infer<typeof ProgressKind>;

/** One line of the live progress list on the page. */
export const ProgressStep = z.object({ at: z.string(), kind: ProgressKind, text: z.string() });
export type ProgressStep = z.infer<typeof ProgressStep>;

/**
 * The live check of a cited link just before the brief was stored (link-check.ts).
 * A "broken" link never reaches a stored brief: its option is left out.
 */
export const LinkCheck = z.object({
  outcome: z.enum(["ok", "blocked", "unverifiable", "unchecked"]),
  /** ISO date-time. */
  checkedAt: z.string(),
  /** Why it is not "ok", in plain words; empty when it is. */
  reason: z.string(),
});
export type LinkCheck = z.infer<typeof LinkCheck>;

/** Where an option's citation points and when it was read. */
export const Citation = z.object({
  url: z.string(),
  title: z.string(),
  /** YYYY-MM-DD. */
  retrievedAt: z.string(),
  origin: SourceOrigin,
  sourceName: z.string().nullable(),
  /** True when Scout read the page itself during the run. */
  pageRead: z.boolean(),
  // The data status of the cited source (D20). Optional, so briefs stored before these fields still parse.
  /** Store rows: typed in by the team, so labelled "Hand-entered". */
  simulated: z.boolean().optional(),
  /** Store rows: the source's state when the brief was written; "cached" is labelled "Cached copy". */
  sourceState: SourceState.nullable().optional(),
  /** Store rows from a cached source: when its recorded copy was taken (ISO). */
  sourceCachedAt: z.string().nullable().optional(),
  /** True when the page Scout read was a stored copy (DEMO_MODE=cached); `retrievedAt` is then the copy's date. */
  pageStored: z.boolean().optional(),
  // Live and web results (B1). Optional, so briefs stored before these fields still parse.
  /** The search that returned it, e.g. "EU Funding & Tenders portal": the page shows "live result, retrieved <time>". */
  liveSource: z.string().nullable().optional(),
  /** When that search answered (ISO date-time). */
  liveRetrievedAt: z.string().nullable().optional(),
  /** INJECTION_LABEL when the result's text looks like instructions to an AI; it was treated as data. */
  injection: z.string().nullable().optional(),
  /** The live link check before the brief was stored. Optional, so briefs stored before it still parse. */
  linkCheck: LinkCheck.optional(),
});
export type Citation = z.infer<typeof Citation>;

export const OptionKind = z.enum(["funding", "testbed", "event", "news", "other"]);
export type OptionKind = z.infer<typeof OptionKind>;

/** One option of a brief: a potential match, never a promise. */
export const ScoutOption = z.object({
  title: z.string(),
  kind: OptionKind,
  /** One concrete thing from the company profile that this option is for. */
  whyProfile: z.string(),
  /** One concrete thing the source says it offers, funds or tests. */
  whySource: z.string(),
  /** As the source states them. */
  requirements: z.array(z.string()),
  contactRoute: z.string(),
  openQuestions: z.array(z.string()),
  citation: Citation,
  /** Set when the source is a row of the opportunity store, so it can be saved. */
  opportunityId: z.string().nullable(),
  deadline: z.string().nullable(),
});
export type ScoutOption = z.infer<typeof ScoutOption>;

export const BriefStats = z.object({
  /** From the job's first step to the stored brief. */
  seconds: z.number(),
  modelCalls: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  searches: z.number(),
  pagesRead: z.number(),
  /** Options the writer gave that failed the checks and were left out. */
  dropped: z.number(),
  /** Options left out because their cited link was broken when checked. Optional for older briefs. */
  linksDropped: z.number().optional(),
  model: z.string(),
});
export type BriefStats = z.infer<typeof BriefStats>;

/** A finished, checked brief. */
export const ScoutBrief = z.object({
  question: z.string(),
  summary: z.string(),
  options: z.array(ScoutOption),
  /** Plain notes for the reader, e.g. that web search was not available. */
  notes: z.array(z.string()),
  /** Set when fewer than MIN_OPTIONS options passed: "only N found". */
  onlyFound: z.number().nullable(),
  webSearch: z.enum(["used", "unavailable"]),
  stats: BriefStats,
  createdAt: z.string(),
});
export type ScoutBrief = z.infer<typeof ScoutBrief>;

/** The `briefs.brief` jsonb column. */
export const StoredBriefJson = z.object({
  progress: z.array(ProgressStep).default([]),
  result: ScoutBrief.nullable().default(null),
});
export type StoredBriefJson = z.infer<typeof StoredBriefJson>;

/** A brief as the API and the page see it. */
export type BriefView = {
  id: string;
  question: string;
  status: "running" | "done" | "failed";
  progress: ProgressStep[];
  result: ScoutBrief | null;
  error: string | null;
  prerun: boolean;
  searchCount: number;
  createdAt: string;
  completedAt: string | null;
  /** Opportunity ids of this brief's options that the company has saved. */
  savedOpportunityIds: string[];
};

/** One line of the list of earlier briefs. */
export type BriefListItem = Pick<BriefView, "id" | "question" | "status" | "prerun" | "createdAt" | "completedAt"> & {
  options: number;
  /** When the run behind the brief was asked (its result's createdAt): for a pre-run copy, the date of the recording. */
  recordedAt: string | null;
};

/** When the run behind a brief was asked. A pre-run copy is a new row, so its own dates are the copy's, not the recording's. */
export function recordedAt(brief: Pick<BriefView, "createdAt" | "completedAt"> & { recordedAt?: string | null; result?: { createdAt: string } | null }): string {
  return brief.result?.createdAt ?? brief.recordedAt ?? brief.completedAt ?? brief.createdAt;
}

/** Options a brief should have; fewer only with an "only N found" note. */
export const MIN_OPTIONS = 5;
export const MAX_OPTIONS = 10;

/** The event that starts the scout-brief job: `{ briefId }`. */
export const SCOUT_EVENT = "app/scout.requested";

/** A member's question: long enough to search for, short enough for one prompt. */
export const QUESTION_LIMITS = { min: 10, max: 500 } as const;

/** The note a brief carries when no live source and no web search answered during its run (B1). */
export const NO_WEB_NOTE = "Web search was not available; built from stored sources.";
