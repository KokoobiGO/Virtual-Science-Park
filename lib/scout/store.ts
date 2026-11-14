/**
 * What a Scout run reads and writes (B4). Jobs and scripts only: getDb()
 * bypasses row-level security. Requests go through queries.ts instead.
 *
 * A run writes only its own `briefs` row: the progress lines while it goes,
 * then the checked brief (status "done") or the error (status "failed").
 * Both sit in the jsonb column `brief` as `{ progress, result }`, because the
 * table has no column for progress (StoredBriefJson in types.ts).
 */
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { briefs, companies, jobRuns } from "../db/schema";
import { loadCompanies } from "../embeddings/enrich";
import type { ProgressStep, ScoutBrief, StoredBriefJson } from "./types";

export class UnknownBriefError extends Error {}

/** The longest error kept on a failed row. */
const MAX_ERROR_CHARS = 500;

export type BriefWork = {
  briefId: string;
  question: string;
  status: "running" | "done" | "failed";
  createdAt: string;
  company: { id: string; slug: string; name: string };
  /** The company's own profile text: active claims, private ones and priorities included. The brief is private to the company. */
  profileText: string;
  /** When this load ran (epoch ms): the run's time budget counts from here. */
  startedAt: number;
};

export async function loadBriefWork(briefId: string): Promise<BriefWork> {
  const db = getDb();
  const [row] = await db
    .select({
      id: briefs.id,
      question: briefs.question,
      status: briefs.status,
      createdAt: briefs.createdAt,
      companyId: companies.id,
      slug: companies.slug,
      name: companies.name,
    })
    .from(briefs)
    .innerJoin(companies, eq(companies.id, briefs.companyId))
    .where(eq(briefs.id, briefId));
  if (!row) throw new UnknownBriefError(`No brief with id "${briefId}".`);
  const [texts] = await loadCompanies([row.companyId]);
  return {
    briefId: row.id,
    question: row.question,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    company: { id: row.companyId, slug: row.slug, name: row.name },
    profileText: texts?.personalText ?? row.name,
    startedAt: Date.now(),
  };
}

const json = (value: StoredBriefJson) => value;

/** The progress so far, while the row is still running. */
export async function saveProgress(briefId: string, progress: ProgressStep[]): Promise<void> {
  await getDb()
    .update(briefs)
    .set({ brief: json({ progress, result: null }) })
    .where(and(eq(briefs.id, briefId), eq(briefs.status, "running")));
}

export async function saveDone(briefId: string, result: ScoutBrief, progress: ProgressStep[], searches: number): Promise<void> {
  await getDb()
    .update(briefs)
    .set({ status: "done", brief: json({ progress, result }), searchCount: searches, error: null, completedAt: new Date() })
    .where(eq(briefs.id, briefId));
}

export async function saveFailed(briefId: string, error: string, progress: ProgressStep[], searches: number): Promise<void> {
  await getDb()
    .update(briefs)
    .set({ status: "failed", brief: json({ progress, result: null }), searchCount: searches, error: error.slice(0, MAX_ERROR_CHARS), completedAt: new Date() })
    .where(eq(briefs.id, briefId));
}

/**
 * Marks a row failed when the job gave up (onFailure), keeping its progress
 * and adding the error as the last line. A finished row is left alone.
 */
export async function markFailed(briefId: string, error: string): Promise<boolean> {
  const message = error.slice(0, MAX_ERROR_CHARS);
  const line = JSON.stringify([{ at: new Date().toISOString(), kind: "error", text: message }]);
  const rows = await getDb()
    .update(briefs)
    .set({
      status: "failed",
      error: message,
      completedAt: new Date(),
      brief: sql`jsonb_build_object('progress', coalesce(${briefs.brief} -> 'progress', '[]'::jsonb) || ${line}::jsonb, 'result', null)`,
    })
    .where(and(eq(briefs.id, briefId), eq(briefs.status, "running")))
    .returning({ id: briefs.id });
  return rows.length > 0;
}

/** A new running row, for the script. The route creates its row as the member (queries.ts). */
export async function createBrief(input: { companyId: string; userId: string; question: string; prerun?: boolean }): Promise<{ id: string; createdAt: string }> {
  const [row] = await getDb()
    .insert(briefs)
    .values({
      companyId: input.companyId,
      userId: input.userId,
      question: input.question,
      status: "running",
      prerun: input.prerun ?? false,
      brief: json({ progress: [], result: null }),
    })
    .returning({ id: briefs.id, createdAt: briefs.createdAt });
  return { id: row.id, createdAt: row.createdAt.toISOString() };
}

/** One row in job_runs, for the cost report and the run history. */
export async function recordRun(input: {
  job: "scout-brief" | "scout-script";
  trigger: string;
  ok: boolean;
  startedAt: Date;
  inputTokens: number;
  outputTokens: number;
  stats: Record<string, unknown>;
  error?: string | null;
}): Promise<void> {
  await getDb()
    .insert(jobRuns)
    .values({
      job: input.job,
      trigger: input.trigger,
      status: input.ok ? "succeeded" : "failed",
      startedAt: input.startedAt,
      finishedAt: new Date(),
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      stats: input.stats,
      error: input.error ?? null,
    });
}
