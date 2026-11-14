/**
 * Stores a company's profile (A6): one claim per field with its checked
 * quotes. Jobs and scripts only: it writes with getDb(), which bypasses
 * row-level security.
 *
 * Nothing is deleted. The profiler's earlier claims become "superseded". Where
 * the member has their own active claim for a field, that stays in charge and
 * the profiler's new claim is stored as "suggested" for the member to accept.
 *
 * The company row gets the profile's status and note (A8) in the same
 * transaction, so a thin flag never points at claims that were not stored.
 * Its embeddings are cleared too: they were built from the old claims, and
 * another job builds them again.
 *
 * Refresh mode (A23, the weekly re-crawl) changes nothing that is shown: a
 * field whose claim really changed (lib/profiler/refresh.ts) gets a
 * "suggested" claim next to the active one, and every other field is left
 * alone. Fields the member answered themselves are not touched.
 */
import { and, eq, inArray } from "drizzle-orm";
import { getDb, type Db } from "../db";
import { claims, companies, companyPrivate, evidence, snapshots } from "../db/schema";
import type { ProfileField } from "../schemas";
import type { ProfileAssessment } from "./assess";
import type { DraftClaim } from "./output";
import { isChangedClaim, type ComparableClaim } from "./refresh";

export type StoredProfile = { active: number; suggested: number; superseded: number; evidence: number };

export type StoreOptions = {
  /** Store only changed claims, as suggestions (A23). Leaves the company's status, note and embeddings alone. */
  refresh?: boolean;
};

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export async function storeProfile(
  companyId: string,
  profile: DraftClaim[],
  assessment: ProfileAssessment,
  options: StoreOptions = {},
): Promise<StoredProfile> {
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

    /** Inserts one claim and its evidence; returns how many quotes were stored. */
    const insertClaim = async (claim: DraftClaim, state: { reviewState: "active" | "suggested"; supersedesId: string | null }) => {
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
          ...state,
        })
        .returning({ id: claims.id });

      if (!claim.evidence.length) return 0;
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
      return claim.evidence.length;
    };

    const current = await tx
      .select({ id: claims.id, field: claims.field, value: claims.value, status: claims.status, updatedBy: claims.updatedBy, reviewState: claims.reviewState })
      .from(claims)
      .where(and(eq(claims.companyId, companyId), inArray(claims.reviewState, ["active", "suggested"])));
    const memberOwned = new Set<ProfileField>(
      current.filter((c) => c.updatedBy === "user" && c.reviewState === "active").map((c) => c.field),
    );

    if (options.refresh) {
      const stored = await storeChanges(tx, profile, current, memberOwned, insertClaim, now);
      await tx.update(companies).set({ lastProfiledAt: now, updatedAt: now }).where(eq(companies.id, companyId));
      return stored;
    }

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

      stored.evidence += await insertClaim(claim, {
        reviewState: suggested ? "suggested" : "active",
        supersedesId: suggested ? null : (replaced.find((c) => c.field === claim.field && c.reviewState === "active")?.id ?? null),
      });
      stored[suggested ? "suggested" : "active"]++;
    }

    await tx
      .update(companies)
      .set({ lastProfiledAt: now, profileStatus: assessment.status, profileNote: assessment.note, publicEmbedding: null, updatedAt: now })
      .where(eq(companies.id, companyId));
    // No row means the member has entered nothing private: nothing to clear.
    await tx.update(companyPrivate).set({ personalEmbedding: null }).where(eq(companyPrivate.companyId, companyId));
    return stored;
  });
}

type CurrentClaim = Pick<typeof claims.$inferSelect, "id" | "field" | "value" | "status" | "updatedBy" | "reviewState">;

/** Refresh mode: one "suggested" claim per changed field, next to the active one. */
async function storeChanges(
  tx: Tx,
  profile: DraftClaim[],
  current: CurrentClaim[],
  memberOwned: Set<ProfileField>,
  insertClaim: (claim: DraftClaim, state: { reviewState: "suggested"; supersedesId: string | null }) => Promise<number>,
  now: Date,
): Promise<StoredProfile> {
  const profilerClaims = current.filter((c) => c.updatedBy === "profiler");
  const ids = profilerClaims.map((c) => c.id);
  const quotes = ids.length
    ? await tx.select({ claimId: evidence.claimId, quote: evidence.quote }).from(evidence).where(inArray(evidence.claimId, ids))
    : [];
  const comparable = (c: CurrentClaim): ComparableClaim => ({
    value: c.value,
    status: c.status,
    quotes: quotes.filter((q) => q.claimId === c.id).map((q) => q.quote),
  });

  const stored: StoredProfile = { active: 0, suggested: 0, superseded: 0, evidence: 0 };
  for (const claim of profile) {
    // The member's own answer is in charge of this field.
    if (memberOwned.has(claim.field)) continue;
    const next: ComparableClaim = { value: claim.value, status: claim.status, quotes: claim.evidence.map((e) => e.quote) };
    const old = profilerClaims.find((c) => c.field === claim.field && c.reviewState === "active");
    if (!isChangedClaim(old ? comparable(old) : null, next)) continue;

    const open = profilerClaims.filter((c) => c.field === claim.field && c.reviewState === "suggested");
    // The same change found again: the open suggestion already says it.
    if (open.some((s) => !isChangedClaim(comparable(s), next))) continue;
    // At most one open suggestion per field.
    if (open.length) {
      await tx
        .update(claims)
        .set({ reviewState: "superseded", updatedAt: now })
        .where(inArray(claims.id, open.map((s) => s.id)));
      stored.superseded += open.length;
    }

    stored.evidence += await insertClaim(claim, { reviewState: "suggested", supersedesId: old?.id ?? null });
    stored.suggested++;
  }
  return stored;
}
