/**
 * The matcher's fixed rules (A15), kept apart from the SQL so they can be
 * tested without a database.
 *
 * The score itself is computed in SQL (rank.ts); these are the inputs it is
 * built from and the shape the rows come back in.
 */
import type { MatchMode, OpportunityKind, ScoreBreakdown, UserPriority } from "../schemas";

/** Rows kept per company and mode. */
export const TOP_N = 20;

/** A deadline or event date further away than this gives no urgency. */
export const URGENCY_DAYS = 60;

/** News older than this is out of the pool. */
export const NEWS_MAX_AGE_DAYS = 45;

/** Opportunities whose externalId starts with this are hand-written fixtures, never ranked. */
export const FIXTURE_PREFIX = "fixture-";

/** Which kind of opportunity answers each priority a member can switch on. */
export const PRIORITY_KINDS = {
  funding: "funding",
  testing: "testbed",
  events: "event",
  partners: "event",
  market: "news",
} as const satisfies Record<UserPriority, OpportunityKind>;

/** The kinds that get the priority boost for these priorities, each once. Unknown values are ignored. */
export function kindsForPriorities(priorities: readonly string[]): OpportunityKind[] {
  const kinds = priorities.flatMap((p) => (Object.hasOwn(PRIORITY_KINDS, p) ? [PRIORITY_KINDS[p as UserPriority]] : []));
  return [...new Set(kinds)];
}

/** One ranked opportunity for one company and mode, as rankCompany returns it. */
export type RankedMatch = {
  opportunityId: string;
  /** 1 is the best. */
  rank: number;
  score: number;
  scoreBreakdown: ScoreBreakdown;
  /** The tags the company and the opportunity share. */
  matchedOn: string[];
};

/** A row of the ranking statement, in Postgres' column names. */
export type RankingRow = {
  opportunity_id: string;
  rank: number;
  score: number;
  similarity: number;
  tag_overlap: number;
  priority_boost: number;
  urgency: number;
  feedback_score: number;
  matched_on: string[];
};

export function toRankedMatch(row: RankingRow, mode: MatchMode): RankedMatch {
  const breakdown: ScoreBreakdown = {
    similarity: Number(row.similarity),
    tagOverlap: Number(row.tag_overlap),
    priorityBoost: Number(row.priority_boost),
    urgency: Number(row.urgency),
    feedback: Number(row.feedback_score),
  };
  // The SQL never reads private input in public mode; this only makes sure.
  if (mode === "public" && (breakdown.priorityBoost !== 0 || breakdown.feedback !== 0)) {
    throw new Error("A public ranking used private input.");
  }
  return {
    opportunityId: row.opportunity_id,
    rank: Number(row.rank),
    score: Number(row.score),
    scoreBreakdown: breakdown,
    matchedOn: row.matched_on ?? [],
  };
}
