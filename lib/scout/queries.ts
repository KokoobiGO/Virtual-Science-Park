/**
 * Scout reads and writes for requests (B4, C10): the API routes and the
 * /scout page. Every query runs as the signed-in member through withUserDb(),
 * so the `briefs_own` and `saved_items_own` policies in drizzle/0002_rls.sql
 * decide every row: a member sees and changes only their own company's.
 *
 * The run itself writes with getDb() from the job (store.ts), never from here.
 */
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import type { JwtClaims } from "../db/user";
import { withUserDb } from "../db/user";
import { briefs, companies, opportunities, savedItems, sourceStatus } from "../db/schema";
import { idsWithoutStatus, withCitationStatus, type CitationStatus } from "./citations";
import { StoredBriefJson, type BriefListItem, type BriefView, type ProgressStep } from "./types";

/** A member as the queries need them: verified claims, user id and company. */
export type Member = { claims: JwtClaims; userId: string; companyId: string };

/** A running brief older than this did not finish (a run stays under 300 s, plus Inngest's retries). */
export const STALE_AFTER_MS = 12 * 60_000;

/** Earlier briefs shown on the page. */
const LIST_LIMIT = 30;

export const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

type BriefRow = typeof briefs.$inferSelect;

function view(row: BriefRow, savedOpportunityIds: string[], now: number): BriefView {
  const stored = StoredBriefJson.safeParse(row.brief ?? {});
  const content = stored.success ? stored.data : { progress: [], result: null };
  const stale = row.status === "running" && now - row.createdAt.getTime() > STALE_AFTER_MS;
  return {
    id: row.id,
    question: row.question,
    status: stale ? "failed" : row.status,
    progress: content.progress,
    result: row.status === "done" ? content.result : null,
    error: stale ? "Scout did not finish this brief. Ask again." : row.error,
    prerun: row.prerun,
    searchCount: row.searchCount,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    savedOpportunityIds,
  };
}

/** The company's earlier briefs, newest first. */
export async function listBriefs(member: Member): Promise<BriefListItem[]> {
  const now = Date.now();
  const rows = await withUserDb(member.claims, (tx) =>
    tx
      .select({
        id: briefs.id,
        question: briefs.question,
        status: briefs.status,
        prerun: briefs.prerun,
        createdAt: briefs.createdAt,
        completedAt: briefs.completedAt,
        options: sql<number>`coalesce(jsonb_array_length(${briefs.brief} -> 'result' -> 'options'), 0)`.mapWith(Number),
        recordedAt: sql<string | null>`${briefs.brief} -> 'result' ->> 'createdAt'`,
      })
      .from(briefs)
      .where(eq(briefs.companyId, member.companyId))
      .orderBy(desc(briefs.createdAt))
      .limit(LIST_LIMIT),
  );
  return rows.map((r) => ({
    id: r.id,
    question: r.question,
    status: r.status === "running" && now - r.createdAt.getTime() > STALE_AFTER_MS ? "failed" : r.status,
    prerun: r.prerun,
    createdAt: r.createdAt.toISOString(),
    completedAt: r.completedAt?.toISOString() ?? null,
    options: r.options,
    recordedAt: r.recordedAt ?? null,
  }));
}

/** The question of one brief of the member's company, for the page title; null when there is none. */
export async function briefQuestion(member: Member, id: string): Promise<string | null> {
  if (!isUuid(id)) return null;
  const [row] = await withUserDb(member.claims, (tx) => tx.select({ question: briefs.question }).from(briefs).where(eq(briefs.id, id)));
  return row?.question ?? null;
}

/** One brief of the member's company, or null (also for another company's id: RLS hides it). */
export async function getBrief(member: Member, id: string): Promise<BriefView | null> {
  if (!isUuid(id)) return null;
  return withUserDb(member.claims, async (tx) => {
    const [row] = await tx.select().from(briefs).where(eq(briefs.id, id));
    if (!row) return null;
    const stored = StoredBriefJson.safeParse(row.brief ?? {});
    const result = stored.success ? stored.data.result : null;
    const optionIds = result?.options.flatMap((o) => (o.opportunityId ? [o.opportunityId] : [])) ?? [];
    const saved = optionIds.length
      ? await tx
          .select({ opportunityId: savedItems.opportunityId })
          .from(savedItems)
          .where(and(eq(savedItems.companyId, member.companyId), inArray(savedItems.opportunityId, optionIds)))
      : [];
    const brief = view(row, saved.map((s) => s.opportunityId), Date.now());

    // A brief written before its citations carried a data status (D20): take it from the cited rows as they are now.
    const missing = brief.result ? idsWithoutStatus(brief.result).filter(isUuid) : [];
    if (brief.result && missing.length) {
      const rows = await tx
        .select({ id: opportunities.id, simulated: opportunities.simulated, sourceState: sourceStatus.state, sourceCachedAt: sourceStatus.cachedAt })
        .from(opportunities)
        .leftJoin(sourceStatus, eq(sourceStatus.label, opportunities.source))
        .where(inArray(opportunities.id, missing));
      const byId = new Map<string, CitationStatus>(
        rows.map((r) => [r.id, { simulated: r.simulated, sourceState: r.sourceState, sourceCachedAt: r.sourceCachedAt?.toISOString() ?? null }]),
      );
      brief.result = withCitationStatus(brief.result, byId);
    }
    return brief;
  });
}

/** A running brief of this company asked in the last few minutes, if any: one at a time per company. */
export async function runningBrief(member: Member): Promise<{ id: string } | null> {
  const since = new Date(Date.now() - STALE_AFTER_MS);
  const [row] = await withUserDb(member.claims, (tx) =>
    tx
      .select({ id: briefs.id })
      .from(briefs)
      .where(and(eq(briefs.companyId, member.companyId), eq(briefs.status, "running"), gt(briefs.createdAt, since)))
      .limit(1),
  );
  return row ?? null;
}

/** A new running row, as the member: RLS checks the company and the user. */
export async function createRunningBrief(member: Member, question: string): Promise<string> {
  const queued: ProgressStep = { at: new Date().toISOString(), kind: "start", text: "Queued. Scout starts in a moment." };
  const [row] = await withUserDb(member.claims, (tx) =>
    tx
      .insert(briefs)
      .values({ companyId: member.companyId, userId: member.userId, question, status: "running", brief: { progress: [queued], result: null } })
      .returning({ id: briefs.id }),
  );
  return row.id;
}

/** When the job could not be started: the row is failed at once, with the reason. */
export async function failUnsent(member: Member, id: string, error: string): Promise<void> {
  await withUserDb(member.claims, (tx) =>
    tx.update(briefs).set({ status: "failed", error: error.slice(0, 500), completedAt: new Date() }).where(eq(briefs.id, id)),
  );
}

/** A copy of a pre-run brief for this company (cached demo mode): done at once. */
export async function copyPrerunBrief(member: Member, input: { question: string; brief: StoredBriefJson; searchCount: number }): Promise<string> {
  const [row] = await withUserDb(member.claims, (tx) =>
    tx
      .insert(briefs)
      .values({
        companyId: member.companyId,
        userId: member.userId,
        question: input.question,
        status: "done",
        prerun: true,
        brief: input.brief,
        searchCount: input.searchCount,
        completedAt: new Date(),
      })
      .returning({ id: briefs.id }),
  );
  return row.id;
}

/** The company's own pre-run briefs that are done, newest first. */
export async function prerunRows(member: Member): Promise<{ id: string; question: string }[]> {
  return withUserDb(member.claims, (tx) =>
    tx
      .select({ id: briefs.id, question: briefs.question })
      .from(briefs)
      .where(and(eq(briefs.companyId, member.companyId), eq(briefs.prerun, true), eq(briefs.status, "done")))
      .orderBy(desc(briefs.createdAt)),
  );
}

/** The member's company slug. */
export async function companySlug(member: Member): Promise<string | null> {
  const [row] = await withUserDb(member.claims, (tx) => tx.select({ slug: companies.slug }).from(companies).where(eq(companies.id, member.companyId)));
  return row?.slug ?? null;
}

/**
 * Saves or unsaves one option of a brief in saved_items. Only an option of
 * this brief that comes from the opportunity store can be saved. Returns
 * false when the brief or the option is not there.
 */
export async function setOptionSaved(member: Member, briefId: string, opportunityId: string, saved: boolean): Promise<boolean> {
  if (!isUuid(briefId) || !isUuid(opportunityId)) return false;
  return withUserDb(member.claims, async (tx) => {
    const [row] = await tx.select({ brief: briefs.brief }).from(briefs).where(eq(briefs.id, briefId));
    const stored = row ? StoredBriefJson.safeParse(row.brief ?? {}) : null;
    if (!stored?.success || !stored.data.result?.options.some((o) => o.opportunityId === opportunityId)) return false;
    if (saved) {
      await tx.insert(savedItems).values({ companyId: member.companyId, opportunityId, userId: member.userId }).onConflictDoNothing();
    } else {
      await tx.delete(savedItems).where(and(eq(savedItems.companyId, member.companyId), eq(savedItems.opportunityId, opportunityId)));
    }
    return true;
  });
}
