/**
 * Reads what the Trust report (C12) shows, as the signed-in user, so
 * row-level security applies (drizzle/0002_rls.sql):
 *
 * - eval_runs and source_status: readable by every signed-in user.
 * - matches: staff read every member's public ranking; a member reads only
 *   its own company's rows. So the totals over every member come from the
 *   stored `matching` eval (lib/eval/matching.ts, run by scripts/eval.ts);
 *   until one is stored, the report counts what the viewer may read, and the
 *   page says which.
 * - job_runs is staff only, so the report does not read it: the quote-check
 *   numbers come from the stored quote_check eval instead.
 *
 * The two results files are read from disk; a missing file is "not measured yet".
 */
import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { desc, inArray } from "drizzle-orm";
import type { Viewer } from "../auth";
import { evalRuns, sourceStatus } from "../db/schema";
import { withUserDb } from "../db/user";
import { countRankedMatches } from "../eval/matching";
import { buildTrustReport, TRUST_EVAL_KINDS, type TrustReport } from "./report";

export const TIMED_TEST_FILE = path.join("data", "timed-test", "results.json");
export const STAFF_SESSION_FILE = path.join("data", "staff-session", "results.json");

export async function loadTrustReport(viewer: Viewer, now: Date = new Date()): Promise<TrustReport> {
  const [rows, timedTestText, staffSessionText] = await Promise.all([
    withUserDb(viewer.claims, async (tx) => {
      // One transaction, so one query at a time.
      const runs = await tx
        .selectDistinctOn([evalRuns.kind], { kind: evalRuns.kind, ranAt: evalRuns.ranAt, summary: evalRuns.summary })
        .from(evalRuns)
        .where(inArray(evalRuns.kind, [...TRUST_EVAL_KINDS]))
        .orderBy(evalRuns.kind, desc(evalRuns.ranAt));
      const sources = await tx
        .select({
          source: sourceStatus.source,
          label: sourceStatus.label,
          state: sourceStatus.state,
          lastSuccessAt: sourceStatus.lastSuccessAt,
          cachedAt: sourceStatus.cachedAt,
          itemCount: sourceStatus.itemCount,
          message: sourceStatus.message,
        })
        .from(sourceStatus);
      // Only needed while no `matching` eval is stored, but one small query either way.
      const counts = await countRankedMatches(tx);
      return { runs, sources, counts };
    }),
    readIfExists(TIMED_TEST_FILE),
    readIfExists(STAFF_SESSION_FILE),
  ]);

  return buildTrustReport({
    role: viewer.role,
    evalRuns: rows.runs,
    sources: rows.sources,
    matches: rows.counts,
    timedTestText,
    staffSessionText,
    now,
  });
}

/**
 * The file's text, or null when it does not exist. Relative paths are from the project root.
 * The turbopackIgnore comment keeps the build from tracing the whole project for this
 * dynamic path; next.config.ts includes the two results files for /trust instead.
 */
export async function readIfExists(relativePath: string): Promise<string | null> {
  try {
    return await readFile(path.join(/*turbopackIgnore: true*/ process.cwd(), relativePath), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
