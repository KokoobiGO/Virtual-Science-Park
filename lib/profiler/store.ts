/**
 * Stores a company's profile (A6): one claim per field with its checked
 * quotes. Jobs and scripts only: it writes with getDb(), which bypasses
 * row-level security.
 *
 * Nothing is deleted. The profiler's earlier claims become "superseded". Where
 * the member has their own active claim for a field, that stays in charge and
 * the profiler's new claim is stored as "suggested" for the member to accept.
 */
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { claims, companies, evidence, snapshots } from "../db/schema";
import type { ProfileField } from "../schemas";
import type { DraftClaim } from "./output";

export type StoredProfile = { active: number; suggested: number; superseded: number; evidence: number };

export async function storeProfile(companyId: string, profile: DraftClaim[]): Promise<StoredProfile> {
  const now = new Date();
  const snapshotIds = [...new Set(profile.flatMap((claim) => claim.evidence.map((e) => e.snapshotId)))];

  return getDb().transaction(async (tx) => {
    const retrievedAt = new Map(
      snapshotIds.length
        ? (await tx.select({ id: snapshots.id, retrievedAt: snapshots.retrievedAt }).from(snapshots).where(inArray(snapshots.id, snapshotIds))).map(
            (s) => [s.id, s.retrievedAt],
          )
        : [],
    );

    const current = await tx
      .select({ id: claims.id, field: claims.field, updatedBy: claims.updatedBy, reviewState: claims.reviewState })
      .from(claims)
      .where(and(eq(claims.companyId, companyId), inArray(claims.reviewState, ["active", "suggested"])));
    const memberOwned = new Set<ProfileField>(
      current.filter((c) => c.updatedBy === "user" && c.reviewState === "active").map((c) => c.field),
    );
    // The profiler's earlier claims for these fields, shown or still waiting as suggestions.
    const replaced = current.filter((c) => c.updatedBy === "profiler" && profile.some((p) => p.field === c.field));

    if (replaced.length) {
      await tx
        .update(claims)
        .set({ reviewState: "superseded", updatedAt: now })
        .where(inArray(claims.id, replaced.map((c) => c.id)));
    }

    const stored: StoredProfile = { active: 0, suggested: 0, superseded: replaced.length, evidence: 0 };
    for (const claim of profile) {
      const suggested = memberOwned.has(claim.field);
      // A suggestion that says "missing" would only ask the member to delete their own answer.
      if (suggested && claim.status === "missing") continue;

      const [row] = await tx
        .insert(claims)
        .values({
          companyId,
          field: claim.field,
          value: claim.value,
          status: claim.status,
          confidence: claim.confidence,
          updatedBy: "profiler",
          visibility: "public",
          reviewState: suggested ? "suggested" : "active",
          supersedesId: suggested ? null : (replaced.find((c) => c.field === claim.field && c.reviewState === "active")?.id ?? null),
        })
        .returning({ id: claims.id });
      stored[suggested ? "suggested" : "active"]++;

      if (claim.evidence.length) {
        await tx.insert(evidence).values(
          claim.evidence.map((e) => ({
            claimId: row.id,
            snapshotId: e.snapshotId,
            url: e.url,
            quote: e.quote,
            quoteLang: e.quoteLang,
            retrievedAt: retrievedAt.get(e.snapshotId) ?? now,
            quoteCheckedAt: now,
          })),
        );
        stored.evidence += claim.evidence.length;
      }
    }

    await tx.update(companies).set({ lastProfiledAt: now, updatedAt: now }).where(eq(companies.id, companyId));
    return stored;
  });
}
