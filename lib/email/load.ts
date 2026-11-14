/**
 * Reads one company's stored "Your week" cards for the digest email (C18).
 * Jobs and scripts only: getDb() bypasses row-level security.
 *
 * The digest is for the current week (Monday in Swedish time, mondayOf()).
 * It never falls back to an older week: with no cards this week there is no
 * email.
 */
import { and, asc, eq } from "drizzle-orm";
import { mondayOf } from "../cards/week";
import { getDb } from "../db";
import { companies, opportunities, trendNotes, weekCards } from "../db/schema";
import { UnknownCompanyError } from "../matcher/store";
import { buildDigest, type DigestCard, type DigestEmail } from "./digest";

export { UnknownCompanyError };

export type PreparedDigest = {
  slug: string;
  companyName: string;
  weekOf: string;
  /** Cards stored for the week. */
  cards: number;
  /** Null when there are no cards: nothing is sent. */
  email: DigestEmail | null;
};

/** The company's cards for that week, in position order, with each card's opportunity or trend area. */
export async function loadDigestCards(companyId: string, weekOf: string): Promise<DigestCard[]> {
  const rows = await getDb()
    .select({
      position: weekCards.position,
      kind: weekCards.kind,
      title: weekCards.title,
      why: weekCards.why,
      nextStep: weekCards.nextStep,
      uncertainties: weekCards.uncertainties,
      sources: weekCards.sources,
      trendArea: trendNotes.area,
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
    .where(and(eq(weekCards.companyId, companyId), eq(weekCards.weekOf, weekOf)))
    .orderBy(asc(weekCards.position));

  return rows.map((r) => ({
    position: r.position,
    kind: r.kind === "trend" ? "trend" : "match",
    title: r.title,
    why: r.why,
    nextStep: r.nextStep,
    uncertainties: r.uncertainties,
    sources: r.sources,
    trendArea: r.trendArea,
    opportunity:
      r.opportunityKind && r.source !== null && r.url !== null
        ? { kind: r.opportunityKind, source: r.source, url: r.url, deadline: r.deadline, eventDate: r.eventDate, simulated: r.simulated ?? false }
        : null,
  }));
}

/**
 * The digest email for one company and the week `now` falls in. Throws
 * UnknownCompanyError for a slug that is not there. Nothing is sent.
 */
export async function prepareDigest(slug: string, { now = new Date(), siteUrl }: { now?: Date; siteUrl: string }): Promise<PreparedDigest> {
  const [company] = await getDb()
    .select({ id: companies.id, slug: companies.slug, name: companies.name })
    .from(companies)
    .where(eq(companies.slug, slug))
    .limit(1);
  if (!company) throw new UnknownCompanyError(`No company with slug: ${slug}.`);

  const weekOf = mondayOf(now);
  const cards = await loadDigestCards(company.id, weekOf);
  return {
    slug: company.slug,
    companyName: company.name,
    weekOf,
    cards: cards.length,
    email: buildDigest({ companyName: company.name, weekOf, cards, siteUrl, now }),
  };
}
