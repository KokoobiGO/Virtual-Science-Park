"use server";

/**
 * The profile editor (C7). Members only, their own company only: the company
 * comes from the session, never from the form, and every write runs on the
 * member's own database client, so row-level security checks it again
 * (drizzle/0002_rls.sql: claims_member_insert, claims_member_update,
 * company_private_own).
 *
 * After a change that affects matching (an edit, an accepted suggestion, a
 * priority) the matcher is asked to re-rank the company with
 * `app/company.profile.changed`.
 */
import { and, eq, inArray } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { getViewer, type Viewer } from "@/lib/auth";
import { claims, companyPrivate } from "@/lib/db/schema";
import { withUserDb } from "@/lib/db/user";
import { inngest } from "@/lib/inngest/client";
import { claimsInCharge } from "@/lib/profile-view/claims";
import { parseValueInput, planEdit, planReview, withPriority } from "@/lib/profile-view/edit";
import { ProfileField, UserPriority } from "@/lib/schemas";

export type ProfileActionState = { error: string | null; message?: string };

const STALE_FORM = "Your profile changed since this page was opened. Reload the page and try again.";

const claimColumns = {
  id: claims.id,
  field: claims.field,
  value: claims.value,
  status: claims.status,
  confidence: claims.confidence,
  visibility: claims.visibility,
  reviewState: claims.reviewState,
  updatedBy: claims.updatedBy,
  supersedesId: claims.supersedesId,
  updatedAt: claims.updatedAt,
};

async function signedInMember(): Promise<(Viewer & { companyId: string }) | null> {
  const viewer = await getViewer();
  if (!viewer || viewer.role !== "member" || !viewer.companyId) return null;
  return { ...viewer, companyId: viewer.companyId };
}

/** Ask the matcher to re-rank. The change is already stored; if Inngest is down, the nightly run catches up. */
async function profileChanged(companyId: string) {
  try {
    await inngest.send({ name: "app/company.profile.changed", data: { companyId } });
  } catch (error) {
    console.error("Could not send app/company.profile.changed:", error);
  }
}

const NOT_A_MEMBER: ProfileActionState = { error: "Only a member can change its own company profile." };
const SAVE_FAILED: ProfileActionState = { error: "Could not save the change. Try again in a moment." };

/** Save a member's own value for one field. Form fields: field, claimId (the claim the member edited, or empty), value, private. */
export async function saveClaim(_prev: ProfileActionState, formData: FormData): Promise<ProfileActionState> {
  const viewer = await signedInMember();
  if (!viewer) return NOT_A_MEMBER;
  const field = ProfileField.safeParse(formData.get("field"));
  if (!field.success) return { error: "Unknown profile field." };
  const parsed = parseValueInput(field.data, String(formData.get("value") ?? ""));
  if (!parsed.ok) return { error: parsed.error };
  const editedId = String(formData.get("claimId") ?? "");
  const visibility = formData.get("private") === "on" ? "private" : "public";

  let outcome: "saved" | "unchanged" | "stale";
  try {
    outcome = await withUserDb(viewer.claims, async (tx) => {
      const active = await tx
        .select(claimColumns)
        .from(claims)
        .where(and(eq(claims.companyId, viewer.companyId), eq(claims.field, field.data), eq(claims.reviewState, "active")));
      const current = claimsInCharge(active).get(field.data) ?? null;
      if ((current?.id ?? "") !== editedId) return "stale";

      const plan = planEdit(field.data, current, active.map((c) => c.id), { value: parsed.value, visibility });
      if (plan.kind === "unchanged") return "unchanged";

      const now = new Date();
      if (plan.supersede.length) {
        await tx
          .update(claims)
          .set({ reviewState: "superseded", updatedAt: now })
          .where(and(eq(claims.companyId, viewer.companyId), inArray(claims.id, plan.supersede)));
      }
      await tx.insert(claims).values({ companyId: viewer.companyId, ...plan.claim, createdAt: now, updatedAt: now });
      return "saved";
    });
  } catch (error) {
    console.error("saveClaim failed:", error);
    return SAVE_FAILED;
  }

  if (outcome === "stale") return { error: STALE_FORM };
  if (outcome === "unchanged") return { error: null, message: "Nothing changed." };
  await profileChanged(viewer.companyId);
  refresh();
  return { error: null, message: "Saved." };
}

const ReviewInput = z.object({ claimId: z.uuid(), decision: z.enum(["accept", "reject"]) });

/** Accept or reject a suggested claim from the weekly profile refresh. Form fields: claimId, decision. */
export async function reviewSuggestion(_prev: ProfileActionState, formData: FormData): Promise<ProfileActionState> {
  const viewer = await signedInMember();
  if (!viewer) return NOT_A_MEMBER;
  const input = ReviewInput.safeParse({ claimId: formData.get("claimId"), decision: formData.get("decision") });
  if (!input.success) return { error: "Unknown suggestion." };

  let error: string | null;
  try {
    error = await withUserDb(viewer.claims, async (tx) => {
      const [suggestion] = await tx
        .select(claimColumns)
        .from(claims)
        .where(and(eq(claims.id, input.data.claimId), eq(claims.companyId, viewer.companyId)));
      if (!suggestion) return "Unknown suggestion.";
      const active = await tx
        .select(claimColumns)
        .from(claims)
        .where(and(eq(claims.companyId, viewer.companyId), eq(claims.field, suggestion.field), eq(claims.reviewState, "active")));

      const plan = planReview(input.data.decision, suggestion, active);
      if ("error" in plan) return plan.error;
      const now = new Date();
      const mine = (ids: string[]) => and(eq(claims.companyId, viewer.companyId), inArray(claims.id, ids));
      if (plan.supersede.length) await tx.update(claims).set({ reviewState: "superseded", updatedAt: now }).where(mine(plan.supersede));
      if (plan.activate) await tx.update(claims).set({ reviewState: "active", updatedAt: now }).where(mine([plan.activate]));
      if (plan.reject) await tx.update(claims).set({ reviewState: "rejected", updatedAt: now }).where(mine([plan.reject]));
      return null;
    });
  } catch (failure) {
    console.error("reviewSuggestion failed:", failure);
    return SAVE_FAILED;
  }

  if (error) return { error };
  // A rejected suggestion was never shown or ranked on, so only accepting changes the matching.
  if (input.data.decision === "accept") await profileChanged(viewer.companyId);
  refresh();
  return { error: null, message: input.data.decision === "accept" ? "Suggestion accepted." : "Suggestion rejected." };
}

/** Switch one of the member's priorities on or off (company_private.user_priorities). */
export async function setPriority(priority: string, on: boolean): Promise<ProfileActionState> {
  const viewer = await signedInMember();
  if (!viewer) return NOT_A_MEMBER;
  const parsed = UserPriority.safeParse(priority);
  if (!parsed.success || typeof on !== "boolean") return { error: "Unknown priority." };

  try {
    await withUserDb(viewer.claims, async (tx) => {
      const [row] = await tx
        .select({ userPriorities: companyPrivate.userPriorities })
        .from(companyPrivate)
        .where(eq(companyPrivate.companyId, viewer.companyId));
      const userPriorities = withPriority(row?.userPriorities ?? [], parsed.data, on);
      if (row) {
        await tx.update(companyPrivate).set({ userPriorities, updatedAt: new Date() }).where(eq(companyPrivate.companyId, viewer.companyId));
      } else {
        await tx.insert(companyPrivate).values({ companyId: viewer.companyId, userPriorities });
      }
    });
  } catch (error) {
    console.error("setPriority failed:", error);
    return SAVE_FAILED;
  }

  await profileChanged(viewer.companyId);
  refresh();
  return { error: null };
}
