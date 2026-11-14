/**
 * Writes behind the card buttons (C4): save / unsave and useful / not
 * relevant.
 *
 * Request paths only: pass the signed-in member's transaction from
 * withUserDb(). The policies saved_items_own and feedback_own
 * (drizzle/0002_rls.sql) let a member write rows for its own company, with
 * its own user id, and nothing else.
 *
 * A saved item belongs to the company (one row per company and opportunity);
 * feedback belongs to the user (one row per company, opportunity and user).
 * The matcher reads both (lib/matcher/rank.ts).
 */
import { and, eq } from "drizzle-orm";
import { companies, feedback, savedItems } from "../db/schema";
import type { UserTx } from "../db/user";
import type { FeedbackKind } from "./load";

type Who = { companyId: string; userId: string; opportunityId: string };

/** Saves or unsaves the opportunity for the company. Returns the new state. */
export async function setSaved(tx: UserTx, { companyId, userId, opportunityId, saved }: Who & { saved: boolean }): Promise<boolean> {
  if (saved) {
    await tx.insert(savedItems).values({ companyId, userId, opportunityId }).onConflictDoNothing();
  } else {
    await tx.delete(savedItems).where(and(eq(savedItems.companyId, companyId), eq(savedItems.opportunityId, opportunityId)));
  }
  return saved;
}

/** Stores this user's feedback on the opportunity, or removes it when `kind` is null. Returns the new state. */
export async function setFeedback(tx: UserTx, { companyId, userId, opportunityId, kind }: Who & { kind: FeedbackKind | null }): Promise<FeedbackKind | null> {
  if (kind) {
    await tx
      .insert(feedback)
      .values({ companyId, userId, opportunityId, kind })
      .onConflictDoUpdate({ target: [feedback.companyId, feedback.opportunityId, feedback.userId], set: { kind, createdAt: new Date() } });
  } else {
    await tx
      .delete(feedback)
      .where(and(eq(feedback.companyId, companyId), eq(feedback.opportunityId, opportunityId), eq(feedback.userId, userId)));
  }
  return kind;
}

/** The company's slug, for the re-rank event (app/match.requested takes slugs). */
export async function companySlug(tx: UserTx, companyId: string): Promise<string | null> {
  const [row] = await tx.select({ slug: companies.slug }).from(companies).where(eq(companies.id, companyId)).limit(1);
  return row?.slug ?? null;
}
