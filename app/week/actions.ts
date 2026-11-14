"use server";

/**
 * The buttons on a Your-week match card (C4). Each one runs as the signed-in
 * member through withUserDb(), so row-level security decides what may be
 * written. The browser only sends which opportunity; the company and user
 * come from the verified session.
 */
import { z } from "zod";
import { getViewer, type Viewer } from "@/lib/auth";
import { withUserDb } from "@/lib/db/user";
import { getT } from "@/lib/i18n/server";
import { inngest } from "@/lib/inngest/client";
import { askBspAboutOpportunity } from "@/lib/week/handoff";
import { companySlug, setFeedback, setSaved } from "@/lib/week/store";

export type ActionFailure = { ok: false; error: string };
export type SaveResult = { ok: true; saved: boolean } | ActionFailure;
/** `reranked` is false when the re-rank could not be requested; the nightly run picks the feedback up. */
export type FeedbackResult = { ok: true; feedback: "useful" | "not_relevant" | null; reranked: boolean } | ActionFailure;
export type AskBspResult = { ok: true; created: boolean } | ActionFailure;

const OpportunityId = z.uuid();
const FeedbackChoice = z.enum(["useful", "not_relevant"]).nullable();

type Member = Viewer & { companyId: string };

async function signedInMember(): Promise<Member | null> {
  const viewer = await getViewer();
  return viewer?.role === "member" && viewer.companyId ? (viewer as Member) : null;
}

/** A failure in the reader's language (C19); the action reads the language cookie itself. */
async function failure(key: "notMember" | "notFound" | "failed" | "chooseFeedback"): Promise<ActionFailure> {
  const t = await getT("week");
  return { ok: false, error: t(`actions.${key}`) };
}

const NOT_A_MEMBER = () => failure("notMember");
const UNKNOWN = () => failure("notFound");

function failed(what: string, error: unknown): Promise<ActionFailure> {
  console.error(`[week] ${what} failed:`, error);
  return failure("failed");
}

export async function saveOpportunity(opportunityId: string, saved: boolean): Promise<SaveResult> {
  const member = await signedInMember();
  if (!member) return NOT_A_MEMBER();
  const id = OpportunityId.safeParse(opportunityId);
  if (!id.success || typeof saved !== "boolean") return UNKNOWN();
  try {
    const now = await withUserDb(member.claims, (tx) =>
      setSaved(tx, { companyId: member.companyId, userId: member.userId, opportunityId: id.data, saved }),
    );
    return { ok: true, saved: now };
  } catch (error) {
    return failed("save", error);
  }
}

export async function giveFeedback(opportunityId: string, kind: "useful" | "not_relevant" | null): Promise<FeedbackResult> {
  const member = await signedInMember();
  if (!member) return NOT_A_MEMBER();
  const id = OpportunityId.safeParse(opportunityId);
  const choice = FeedbackChoice.safeParse(kind);
  if (!id.success) return UNKNOWN();
  if (!choice.success) return failure("chooseFeedback");
  let stored: { feedback: "useful" | "not_relevant" | null; slug: string | null };
  try {
    stored = await withUserDb(member.claims, async (tx) => ({
      feedback: await setFeedback(tx, { companyId: member.companyId, userId: member.userId, opportunityId: id.data, kind: choice.data }),
      slug: await companySlug(tx, member.companyId),
    }));
  } catch (error) {
    return failed("feedback", error);
  }

  // The matcher reads feedback (lib/matcher/rank.ts): re-rank this company now
  // instead of at the nightly run. The feedback is stored either way.
  let reranked = false;
  if (stored.slug) {
    try {
      await inngest.send({ name: "app/match.requested", data: { slugs: [stored.slug] } });
      reranked = true;
    } catch (error) {
      console.error("[week] re-rank request failed:", error);
    }
  }
  return { ok: true, feedback: stored.feedback, reranked };
}

export async function askBsp(opportunityId: string): Promise<AskBspResult> {
  const member = await signedInMember();
  if (!member) return NOT_A_MEMBER();
  const id = OpportunityId.safeParse(opportunityId);
  if (!id.success) return UNKNOWN();
  try {
    const result = await withUserDb(member.claims, (tx) =>
      askBspAboutOpportunity(tx, { companyId: member.companyId, userId: member.userId, opportunityId: id.data }),
    );
    return result ? { ok: true, created: result.created } : UNKNOWN();
  } catch (error) {
    return failed("ask BSP", error);
  }
}
