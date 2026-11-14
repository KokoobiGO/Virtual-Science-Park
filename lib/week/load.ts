/**
 * Reads for the "Your week" screen (C3) and the calendar download (C4).
 *
 * Request paths only: pass the signed-in member's transaction from
 * withUserDb(), so row-level security decides every row. week_cards,
 * saved_items, feedback and handoffs are the company's own
 * (drizzle/0002_rls.sql, drizzle/0004_matching_tables.sql); opportunities and
 * trend notes are readable by every signed-in user.
 */
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { feedback, handoffs, opportunities, savedItems, trendNotes, weekCards } from "../db/schema";
import type { UserTx } from "../db/user";
import type { OpportunityKind } from "../schemas";
import type { CalendarItem } from "./ics";

export type FeedbackKind = "useful" | "not_relevant";

export type WeekCardOpportunity = {
  id: string;
  kind: OpportunityKind;
  source: string;
  url: string;
  deadline: Date | null;
  eventDate: Date | null;
  simulated: boolean;
};

export type WeekCardView = {
  id: string;
  position: number;
  kind: "match" | "trend";
  title: string;
  why: string;
  nextStep: string;
  uncertainties: string[];
  sources: { url: string; title?: string }[];
  /** Set on match cards. */
  opportunity: WeekCardOpportunity | null;
  /** The technology area of a trend card, e.g. "marine". */
  trendArea: string | null;
  /** The company saved this opportunity. */
  saved: boolean;
  /** This user's own feedback on it. */
  feedback: FeedbackKind | null;
  /** The company has an open question to BSP staff about it. */
  askedBsp: boolean;
};

/** The newest stored week of cards; `weekOf` is null when the company has none. */
export type WeekView = { weekOf: string | null; cards: WeekCardView[] };

/** The opportunity id a Your-week handoff is about (see handoff.ts). */
export const handoffOpportunityId = sql<string>`${handoffs.context} ->> 'opportunityId'`;

export async function loadWeek(tx: UserTx, { companyId, userId }: { companyId: string; userId: string }): Promise<WeekView> {
  const [latest] = await tx
    .select({ weekOf: weekCards.weekOf })
    .from(weekCards)
    .where(eq(weekCards.companyId, companyId))
    .orderBy(desc(weekCards.weekOf))
    .limit(1);
  if (!latest) return { weekOf: null, cards: [] };

  const rows = await tx
    .select({
      id: weekCards.id,
      position: weekCards.position,
      kind: weekCards.kind,
      title: weekCards.title,
      why: weekCards.why,
      nextStep: weekCards.nextStep,
      uncertainties: weekCards.uncertainties,
      sources: weekCards.sources,
      trendArea: trendNotes.area,
      opportunityId: opportunities.id,
      opportunityKind: opportunities.kind,
      source: opportunities.source,
      url: opportunities.url,
      deadline: opportunities.deadline,
      eventDate: opportunities.eventDate,
      simulated: opportunities.simulated,
    })
    .from(weekCards)
    .leftJoin(opportunities, eq(opportunities.id, weekCards.opportunityId))
    .leftJoin(trendNotes, eq(trendNotes.id, weekCards.trendNoteId))
    .where(and(eq(weekCards.companyId, companyId), eq(weekCards.weekOf, latest.weekOf)))
    .orderBy(asc(weekCards.position));

  const ids = rows.flatMap((r) => (r.opportunityId ? [r.opportunityId] : []));
  const [saved, given, asked] = ids.length
    ? await Promise.all([
        tx
          .select({ opportunityId: savedItems.opportunityId })
          .from(savedItems)
          .where(and(eq(savedItems.companyId, companyId), inArray(savedItems.opportunityId, ids))),
        tx
          .select({ opportunityId: feedback.opportunityId, kind: feedback.kind })
          .from(feedback)
          .where(and(eq(feedback.companyId, companyId), eq(feedback.userId, userId), inArray(feedback.opportunityId, ids))),
        tx
          .select({ opportunityId: handoffOpportunityId })
          .from(handoffs)
          .where(and(eq(handoffs.companyId, companyId), eq(handoffs.status, "open"), inArray(handoffOpportunityId, ids))),
      ])
    : [[], [], []];

  const savedIds = new Set(saved.map((s) => s.opportunityId));
  const feedbackBy = new Map(given.map((f) => [f.opportunityId, f.kind]));
  const askedIds = new Set(asked.map((h) => h.opportunityId));

  return {
    weekOf: latest.weekOf,
    cards: rows.map((r) => ({
      id: r.id,
      position: r.position,
      kind: r.kind === "trend" ? "trend" : "match",
      title: r.title,
      why: r.why,
      nextStep: r.nextStep,
      uncertainties: r.uncertainties,
      sources: r.sources,
      trendArea: r.trendArea,
      opportunity:
        r.opportunityId && r.opportunityKind && r.source !== null && r.url !== null
          ? {
              id: r.opportunityId,
              kind: r.opportunityKind,
              source: r.source,
              url: r.url,
              deadline: r.deadline,
              eventDate: r.eventDate,
              simulated: r.simulated ?? false,
            }
          : null,
      saved: r.opportunityId ? savedIds.has(r.opportunityId) : false,
      feedback: r.opportunityId ? (feedbackBy.get(r.opportunityId) ?? null) : null,
      askedBsp: r.opportunityId ? askedIds.has(r.opportunityId) : false,
    })),
  };
}

/** What the calendar file needs about one opportunity, or null when there is no such opportunity. */
export async function loadCalendarItem(tx: UserTx, opportunityId: string): Promise<CalendarItem | null> {
  const [row] = await tx
    .select({
      opportunityId: opportunities.id,
      kind: opportunities.kind,
      title: opportunities.title,
      url: opportunities.url,
      source: opportunities.source,
      deadline: opportunities.deadline,
      eventDate: opportunities.eventDate,
    })
    .from(opportunities)
    .where(eq(opportunities.id, opportunityId))
    .limit(1);
  return row ?? null;
}
