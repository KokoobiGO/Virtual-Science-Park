/**
 * Reads for the "Your week" screen (C3) and the calendar download (C4).
 *
 * Request paths only: pass the signed-in member's transaction from
 * withUserDb(), so row-level security decides every row. week_cards,
 * saved_items, feedback and handoffs are the company's own
 * (drizzle/0002_rls.sql, drizzle/0004_matching_tables.sql); opportunities and
 * trend notes are readable by every signed-in user.
 */
import { and, asc, desc, eq, inArray, max, sql } from "drizzle-orm";
import { claims, companyPrivate, feedback, handoffs, opportunities, savedItems, sourceStatus, trendNotes, weekCards } from "../db/schema";
import type { UserTx } from "../db/user";
import type { OpportunityKind, SourceState } from "../schemas";
import type { CalendarItem } from "./ics";

export type FeedbackKind = "useful" | "not_relevant";

export type WeekCardOpportunity = {
  id: string;
  kind: OpportunityKind;
  source: string;
  url: string;
  /** When the call opens; a date ahead means it is not open yet. */
  opensAt: Date | null;
  deadline: Date | null;
  eventDate: Date | null;
  /** Hand-entered, or (with a `fixture-` external id) simulated: see itemDataStatus in components/data-status-label.tsx. */
  simulated: boolean;
  externalId: string;
  /** The state of the opportunity's source (source_status), null when it has no row there. */
  sourceState: SourceState | null;
  /** For a cached source: the date of the recorded copy. */
  cachedAt: Date | null;
};

export type WeekCardView = {
  id: string;
  /** Stays the same when the cards are built again (the row id does not): the opportunity or trend note. */
  key: string;
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

/**
 * The newest stored week of cards; `weekOf` is null when the company has
 * none. `builtAt` is when they were built: a build replaces the week's cards
 * in one transaction, so they share it.
 */
export type WeekView = { weekOf: string | null; builtAt: Date | null; cards: WeekCardView[] };

/** The opportunity id a Your-week handoff is about (see handoff.ts). */
export const handoffOpportunityId = sql<string>`${handoffs.context} ->> 'opportunityId'`;

/** The newest week the company has cards for, and when they were built. */
async function latestWeek(tx: UserTx, companyId: string): Promise<{ weekOf: string; builtAt: Date } | null> {
  const [latest] = await tx
    .select({ weekOf: weekCards.weekOf, builtAt: weekCards.createdAt })
    .from(weekCards)
    .where(eq(weekCards.companyId, companyId))
    .orderBy(desc(weekCards.weekOf), desc(weekCards.createdAt))
    .limit(1);
  return latest ?? null;
}

/**
 * The last change to what the matching reads from the profile: the newest
 * active or superseded claim (an edit, an accepted suggestion) or the
 * company_private row (priorities; the personal embedding is written there
 * too, before the cards are built again). Null when there is neither.
 */
export async function loadProfileChangedAt(tx: UserTx, companyId: string): Promise<Date | null> {
  const [[claimed], [own]] = await Promise.all([
    tx
      .select({ at: max(claims.updatedAt) })
      .from(claims)
      .where(and(eq(claims.companyId, companyId), inArray(claims.reviewState, ["active", "superseded"]))),
    tx.select({ at: companyPrivate.updatedAt }).from(companyPrivate).where(eq(companyPrivate.companyId, companyId)),
  ]);
  const times = [claimed?.at, own?.at].filter((d): d is Date => d instanceof Date);
  return times.length ? new Date(Math.max(...times.map((d) => d.getTime()))) : null;
}

/** What the Your-week page polls (app/api/week/route.ts): the newest week, when its cards were built, and the last profile change. */
export type WeekStatus = { weekOf: string | null; builtAt: Date | null; profileChangedAt: Date | null };

export async function loadWeekStatus(tx: UserTx, companyId: string): Promise<WeekStatus> {
  const [latest, profileChangedAt] = await Promise.all([latestWeek(tx, companyId), loadProfileChangedAt(tx, companyId)]);
  return { weekOf: latest?.weekOf ?? null, builtAt: latest?.builtAt ?? null, profileChangedAt };
}

export async function loadWeek(tx: UserTx, { companyId, userId }: { companyId: string; userId: string }): Promise<WeekView> {
  const latest = await latestWeek(tx, companyId);
  if (!latest) return { weekOf: null, builtAt: null, cards: [] };

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
      trendNoteId: weekCards.trendNoteId,
      trendArea: trendNotes.area,
      opportunityId: opportunities.id,
      opportunityKind: opportunities.kind,
      source: opportunities.source,
      url: opportunities.url,
      opensAt: opportunities.opensAt,
      deadline: opportunities.deadline,
      eventDate: opportunities.eventDate,
      simulated: opportunities.simulated,
      externalId: opportunities.externalId,
      // For the data status label (D20): opportunities.source is the collector's label.
      sourceState: sourceStatus.state,
      cachedAt: sourceStatus.cachedAt,
    })
    .from(weekCards)
    .leftJoin(opportunities, eq(opportunities.id, weekCards.opportunityId))
    .leftJoin(sourceStatus, eq(sourceStatus.label, opportunities.source))
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
    builtAt: latest.builtAt,
    cards: rows.map((r) => ({
      id: r.id,
      key: r.opportunityId ? `opportunity:${r.opportunityId}` : r.trendNoteId ? `trend:${r.trendNoteId}` : `card:${r.id}`,
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
              opensAt: r.opensAt,
              deadline: r.deadline,
              eventDate: r.eventDate,
              simulated: r.simulated ?? false,
              externalId: r.externalId ?? "",
              sourceState: r.sourceState,
              cachedAt: r.cachedAt,
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
