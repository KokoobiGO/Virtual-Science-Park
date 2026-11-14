/**
 * Whether a company's embeddings still match its profile text (A18, C8).
 * Jobs only: reads with getDb().
 *
 * A member's text edit or accepted suggestion writes claims (a new active
 * claim, the old one superseded), and never the companies row. The embeddings
 * are written by enrichCompanies, which also updates the companies row, so
 * `companies.updated_at` moves with them (Drizzle's $onUpdate). Claims newer
 * than that row mean the text changed after the last embedding. A priority
 * switch only touches company_private, so it never asks for a new embedding:
 * the ranking applies priorities itself (priorityBoost in lib/matcher/rank.ts).
 */
import { and, eq, inArray, max, sql } from "drizzle-orm";
import { getDb } from "../db";
import { claims, companies, companyPrivate } from "../db/schema";

export type EmbeddingAge = {
  companyId: string;
  slug: string;
  /** One of the two embeddings is not there. */
  missing: boolean;
  /** The newest active or superseded claim; null without claims. */
  claimsChangedAt: Date | null;
  /** When the companies row was last written: the last embedding, or later. */
  embeddedAt: Date;
};

/** A new embedding is due when one is missing or a claim changed after the companies row was last written. */
export function needsNewEmbedding({ missing, claimsChangedAt, embeddedAt }: Pick<EmbeddingAge, "missing" | "claimsChangedAt" | "embeddedAt">): boolean {
  return missing || (claimsChangedAt !== null && claimsChangedAt.getTime() > embeddedAt.getTime());
}

export class UnknownCompanyError extends Error {}

export async function embeddingAge(companyId: string): Promise<EmbeddingAge> {
  const db = getDb();
  const [[company], [claimed]] = await Promise.all([
    db
      .select({
        slug: companies.slug,
        updatedAt: companies.updatedAt,
        // Whether they are there, not the 1024 numbers each.
        missing: sql<boolean>`${companies.publicEmbedding} is null or ${companyPrivate.personalEmbedding} is null`,
      })
      .from(companies)
      .leftJoin(companyPrivate, eq(companyPrivate.companyId, companies.id))
      .where(eq(companies.id, companyId)),
    db
      .select({ at: max(claims.updatedAt) })
      .from(claims)
      .where(and(eq(claims.companyId, companyId), inArray(claims.reviewState, ["active", "superseded"]))),
  ]);
  if (!company) throw new UnknownCompanyError(`No company with id ${companyId}.`);
  return {
    companyId,
    slug: company.slug,
    missing: company.missing,
    claimsChangedAt: claimed?.at ?? null,
    embeddedAt: company.updatedAt,
  };
}
