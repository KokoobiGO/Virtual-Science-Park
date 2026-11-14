/**
 * Matching totals for the Trust report (C12), over every member, per ranking
 * mode. A member may read only its own company's matches (row-level security),
 * so the report cannot count all members as the viewer; this eval counts them
 * with getDb() (scripts only) and stores the totals in eval_runs, which every
 * signed-in user may read. Only counts are stored: nothing about any one
 * company.
 *
 * The rows counted are the ranked ones (rank is set: in a company's top 20
 * now), as lib/judge/store.ts judgeCoverage() counts them:
 * ranked = kept + rejected + not judged yet.
 */
import { isNotNull, sql } from "drizzle-orm";
import { getDb, type Db } from "../db";
import { matches } from "../db/schema";
import type { MatchMode } from "../schemas";
import { percent, ratio, textTable, type EvalResult } from "./result";

/** The order the report shows: the public ranking first, the one staff and members both see. */
export const MATCH_MODES: readonly MatchMode[] = ["public", "personal"];

export const MATCHING_DEFINITIONS =
  "Per ranking mode, over every member: companies with at least one ranked match; ranked = matches in a company's top 20 now; " +
  "judged = ranked matches the judge has read; kept and rejected split the judged ones; not judged yet = ranked - judged; " +
  "lastJudgedAt = the latest judgement among the ranked matches.";

/** One mode's counts as the query returns them. */
export type MatchingCountRow = { mode: MatchMode; companies: number; ranked: number; judged: number; rejected: number; lastJudgedAt: Date | null };

/** One mode's counts as stored in the summary. */
export type MatchingModeCounts = {
  mode: MatchMode;
  companies: number;
  ranked: number;
  judged: number;
  kept: number;
  rejected: number;
  notJudgedYet: number;
  /** ISO, or null while nothing is judged. */
  lastJudgedAt: string | null;
};

export type MatchingSummary = { modes: MatchingModeCounts[] };
export type MatchingDetails = { definitions: string };

/**
 * The ranked matches per mode in the rows `db` may read. With getDb() that is
 * every member; lib/trust/load.ts runs it as the viewer for its fallback.
 */
export function countRankedMatches(db: Pick<Db, "select">): Promise<MatchingCountRow[]> {
  return db
    .select({
      mode: matches.mode,
      companies: sql<number>`count(distinct ${matches.companyId})`.mapWith(Number),
      ranked: sql<number>`count(*)`.mapWith(Number),
      judged: sql<number>`count(*) filter (where ${matches.judgedAt} is not null)`.mapWith(Number),
      rejected: sql<number>`count(*) filter (where ${matches.judgedAt} is not null and ${matches.rejected})`.mapWith(Number),
      lastJudgedAt: sql<Date | null>`max(${matches.judgedAt})`.mapWith(matches.judgedAt),
    })
    .from(matches)
    .where(isNotNull(matches.rank))
    .groupBy(matches.mode);
}

/** Both modes, public first; a mode without rows is all zeros. */
export function scoreMatching(rows: readonly MatchingCountRow[]): EvalResult<MatchingSummary, MatchingDetails> {
  const modes = MATCH_MODES.map((mode): MatchingModeCounts => {
    const row = rows.find((r) => r.mode === mode);
    const ranked = row?.ranked ?? 0;
    const judged = row?.judged ?? 0;
    const rejected = row?.rejected ?? 0;
    return {
      mode,
      companies: row?.companies ?? 0,
      ranked,
      judged,
      kept: judged - rejected,
      rejected,
      notJudgedYet: ranked - judged,
      lastJudgedAt: row?.lastJudgedAt ? row.lastJudgedAt.toISOString() : null,
    };
  });
  return { kind: "matching", summary: { modes }, details: { definitions: MATCHING_DEFINITIONS } };
}

/** The eval: count every member's ranked matches. */
export async function matchingEval(db: Db = getDb()): Promise<EvalResult<MatchingSummary, MatchingDetails>> {
  return scoreMatching(await countRankedMatches(db));
}

export function matchingTable(summary: MatchingSummary): string[] {
  const rows = [
    ["mode", "companies", "ranked", "judged", "kept", "rejected", "not judged yet", "last judged (UTC)"],
    ...summary.modes.map((m) => [
      m.mode,
      String(m.companies),
      String(m.ranked),
      String(m.judged),
      `${m.kept} (${percent(ratio(m.kept, m.judged))})`,
      `${m.rejected} (${percent(ratio(m.rejected, m.judged))})`,
      String(m.notJudgedYet),
      m.lastJudgedAt ? m.lastJudgedAt.slice(0, 16).replace("T", " ") : "-",
    ]),
  ];
  return ["Ranked matches over every member, per ranking mode.", ...textTable(rows)];
}
