/**
 * Store a ranking in `matches` (A15). Jobs and scripts only: rankAndStore and
 * companiesToMatch use getDb(), which bypasses row-level security, and members
 * may not write matches anyway.
 *
 * A stored row keeps what the judge (A16) wrote earlier (`why`, `nextStep`,
 * `uncertainties`, `judgedAt`) and whether it rejected the match: only the
 * score, its breakdown, `matchedOn`, the rank and `computedAt` change. Rows
 * that are no longer in the top 20 keep their text but lose their rank; no row
 * is ever deleted here. Storing also says whether the top 20 changed, so the
 * match job knows which companies to judge and build cards for again.
 *
 * A company without an embedding for a mode is skipped in that mode and its
 * stored matches are left alone: the embedding is only missing between a new
 * profile and the next enrichment, and a blank ranking would hide its matches.
 */
import { and, asc, eq, inArray, isNotNull, notInArray, sql } from "drizzle-orm";
import { getDb } from "../db";
import { companies, companyPrivate, matches } from "../db/schema";
import { MatchMode } from "../schemas";
import { rankCompany, type Executor, type RankOptions } from "./rank";
import type { RankedMatch } from "./score";

export type StoredRanking = {
  /** Rows written with a rank. */
  ranked: number;
  /** Other rows of this company and mode that lost their rank. */
  unranked: number;
  /** The top 20 is not what was stored before: another opportunity, or another rank. */
  changed: boolean;
};

type RankedId = { opportunityId: string; rank: number | null };

/** True when both lists hold the same opportunities at the same ranks, in any order. */
export function sameRanking(a: readonly RankedId[], b: readonly RankedId[]): boolean {
  if (a.length !== b.length) return false;
  const ranks = new Map(a.map((r) => [r.opportunityId, r.rank]));
  return b.every((r) => ranks.has(r.opportunityId) && ranks.get(r.opportunityId) === r.rank);
}

/** Upserts the ranked rows and takes the rank off every other row of this company and mode, in one transaction. */
export async function storeRanking(db: Executor, companyId: string, mode: MatchMode, rows: RankedMatch[]): Promise<StoredRanking> {
  const computedAt = new Date();
  const ids = rows.map((r) => r.opportunityId);
  return db.transaction(async (tx) => {
    const before = await tx
      .select({ opportunityId: matches.opportunityId, rank: matches.rank })
      .from(matches)
      .where(and(eq(matches.companyId, companyId), eq(matches.mode, mode), isNotNull(matches.rank)));
    const changed = !sameRanking(before, rows);
    if (rows.length) {
      await tx
        .insert(matches)
        .values(
          rows.map((r) => ({
            companyId,
            opportunityId: r.opportunityId,
            mode,
            score: r.score,
            scoreBreakdown: r.scoreBreakdown,
            matchedOn: r.matchedOn,
            rank: r.rank,
            computedAt,
          })),
        )
        .onConflictDoUpdate({
          target: [matches.companyId, matches.opportunityId, matches.mode],
          set: {
            score: sql`excluded.score`,
            scoreBreakdown: sql`excluded.score_breakdown`,
            matchedOn: sql`excluded.matched_on`,
            rank: sql`excluded.rank`,
            computedAt: sql`excluded.computed_at`,
          },
        });
    }
    const unranked = await tx
      .update(matches)
      .set({ rank: null })
      .where(
        and(
          eq(matches.companyId, companyId),
          eq(matches.mode, mode),
          isNotNull(matches.rank),
          ids.length ? notInArray(matches.opportunityId, ids) : undefined,
        ),
      )
      .returning({ id: matches.id });
    return { ranked: rows.length, unranked: unranked.length, changed };
  });
}

/** A mode that was not ranked, and why. Its stored matches were not touched. */
export type SkippedRanking = { skipped: string };

export type RankAndStoreResult = {
  companyId: string;
  personal: StoredRanking | SkippedRanking;
  public: StoredRanking | SkippedRanking;
  /** Wall time for both modes, ranking and storing. */
  ms: number;
};

/** Which of the company's two embeddings are there. */
async function embeddingsOf(db: Executor, companyId: string): Promise<Record<MatchMode, boolean>> {
  const [row] = await db
    .select({
      public: sql<boolean>`${companies.publicEmbedding} is not null`,
      personal: sql<boolean>`${companyPrivate.personalEmbedding} is not null`,
    })
    .from(companies)
    .leftJoin(companyPrivate, eq(companyPrivate.companyId, companies.id))
    .where(eq(companies.id, companyId));
  return { public: row?.public ?? false, personal: row?.personal ?? false };
}

/**
 * Ranks one company in both modes and stores both, with the service client
 * (`db` is there so a test can pass a transaction). A mode without an
 * embedding is skipped.
 */
export async function rankAndStore(companyId: string, { now, db = getDb() }: Pick<RankOptions, "now"> & { db?: Executor } = {}): Promise<RankAndStoreResult> {
  const started = performance.now();
  const has = await embeddingsOf(db, companyId);
  const stored = {} as Record<MatchMode, StoredRanking | SkippedRanking>;
  for (const mode of MatchMode.options) {
    stored[mode] = has[mode]
      ? await storeRanking(db, companyId, mode, await rankCompany(db, companyId, mode, { now }))
      : { skipped: `no ${mode} embedding` };
  }
  return { companyId, ...stored, ms: Math.round(performance.now() - started) };
}

export const isSkipped = (outcome: StoredRanking | SkippedRanking): outcome is SkippedRanking => "skipped" in outcome;

/** The stored top 20 changed in at least one mode that was ranked. */
export const rankingChanged = (outcome: Pick<RankAndStoreResult, MatchMode>): boolean =>
  MatchMode.options.some((mode) => {
    const stored = outcome[mode];
    return !isSkipped(stored) && stored.changed;
  });

export type CompanyToMatch = { id: string; slug: string; name: string };

export class UnknownCompanyError extends Error {}

/**
 * The company with this id, the companies behind these slugs, or, with
 * neither, every company that has a public embedding (one without has nothing
 * to rank). Throws UnknownCompanyError for an id or slug that is not there.
 */
export async function companiesToMatch({ slugs, companyId }: { slugs?: readonly string[]; companyId?: string } = {}): Promise<CompanyToMatch[]> {
  const columns = { id: companies.id, slug: companies.slug, name: companies.name };
  const query = getDb().select(columns).from(companies);
  if (companyId) {
    const rows = await query.where(eq(companies.id, companyId));
    if (!rows.length) throw new UnknownCompanyError(`No company with id ${companyId}.`);
    return rows;
  }
  if (!slugs?.length) return query.where(isNotNull(companies.publicEmbedding)).orderBy(asc(companies.slug));
  const rows = await query.where(inArray(companies.slug, [...slugs])).orderBy(asc(companies.slug));
  const unknown = slugs.filter((slug) => !rows.some((r) => r.slug === slug));
  if (unknown.length) throw new UnknownCompanyError(`No company with slug: ${unknown.join(", ")}.`);
  return rows;
}
