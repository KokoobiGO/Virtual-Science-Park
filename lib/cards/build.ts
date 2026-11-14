/**
 * Build and store the "Your week" cards (A17). Jobs and scripts only: getDb()
 * bypasses row-level security. No model call: the cards reuse the judge's
 * text on the personal matches (select.ts picks them).
 *
 * Cards are stored per company and week (`weekOf`, the Monday in Swedish
 * time). Building again for the same week replaces that company's cards for
 * that week, in one transaction.
 */
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb } from "../db";
import { companies, matches, opportunities, trendNotes, weekCards } from "../db/schema";
import type { Executor } from "../matcher/rank";
import { UnknownCompanyError } from "../matcher/store";
import { buildCards, type CardDraft } from "./select";
import { mondayOf } from "./week";

export { UnknownCompanyError };

export type CompanyForCards = { id: string; slug: string; name: string; tags: string[] };

/**
 * The companies behind these slugs, or, without slugs, every company with at
 * least one judged personal match that is ranked. Throws UnknownCompanyError
 * for a slug that is not there.
 */
export async function companiesForCards({ slugs }: { slugs?: readonly string[] } = {}): Promise<CompanyForCards[]> {
  const db = getDb();
  const columns = { id: companies.id, slug: companies.slug, name: companies.name, tags: companies.tags };
  if (slugs?.length) {
    const rows = await db.select(columns).from(companies).where(inArray(companies.slug, [...slugs])).orderBy(asc(companies.slug));
    const unknown = slugs.filter((slug) => !rows.some((r) => r.slug === slug));
    if (unknown.length) throw new UnknownCompanyError(`No company with slug: ${unknown.join(", ")}.`);
    return rows;
  }
  return db
    .selectDistinct(columns)
    .from(companies)
    .innerJoin(matches, eq(matches.companyId, companies.id))
    .where(and(eq(matches.mode, "personal"), isNotNull(matches.rank), isNotNull(matches.judgedAt)))
    .orderBy(asc(companies.slug));
}

/** The cards for one company and week, from what is stored now. Nothing is written. */
export async function draftWeekCards(company: CompanyForCards, weekOf: string): Promise<CardDraft[]> {
  const db = getDb();
  const [candidates, notes] = await Promise.all([
    db
      .select({
        matchId: matches.id,
        opportunityId: matches.opportunityId,
        rank: matches.rank,
        judgedAt: matches.judgedAt,
        rejected: matches.rejected,
        kind: opportunities.kind,
        source: opportunities.source,
        title: opportunities.title,
        url: opportunities.url,
        why: matches.why,
        nextStep: matches.nextStep,
        uncertainties: matches.uncertainties,
      })
      .from(matches)
      .innerJoin(opportunities, eq(opportunities.id, matches.opportunityId))
      .where(and(eq(matches.companyId, company.id), eq(matches.mode, "personal"), isNotNull(matches.rank)))
      .orderBy(asc(matches.rank)),
    company.tags.length
      ? db
          .select({ id: trendNotes.id, area: trendNotes.area, weekOf: trendNotes.weekOf, title: trendNotes.title, body: trendNotes.body, sources: trendNotes.sources })
          .from(trendNotes)
          .where(and(eq(trendNotes.weekOf, weekOf), inArray(trendNotes.area, company.tags)))
      : Promise.resolve([]),
  ]);
  return buildCards(
    candidates.map(({ judgedAt, ...c }) => ({ ...c, judged: judgedAt !== null })),
    { trendNotes: notes, weekOf, companyTags: company.tags },
  );
}

/**
 * Replaces the company's cards for that week with these, in one transaction
 * (`db` is there so a test can pass a transaction). Returns the cards written.
 */
export async function storeWeekCards(companyId: string, weekOf: string, cards: readonly CardDraft[], { db = getDb() }: { db?: Executor } = {}): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.delete(weekCards).where(and(eq(weekCards.companyId, companyId), eq(weekCards.weekOf, weekOf)));
    if (!cards.length) return 0;
    const rows = await tx
      .insert(weekCards)
      .values(cards.map((card) => ({ companyId, weekOf, ...card })))
      .returning({ id: weekCards.id });
    return rows.length;
  });
}

export type BuiltWeekCards = { slug: string; name: string; weekOf: string; cards: CardDraft[]; stored: number | null };

/** Builds one company's cards for the week `now` falls in, and stores them unless `dry`. */
export async function buildWeekCards(company: CompanyForCards, { now = new Date(), dry = false }: { now?: Date; dry?: boolean } = {}): Promise<BuiltWeekCards> {
  const weekOf = mondayOf(now);
  const cards = await draftWeekCards(company, weekOf);
  const stored = dry ? null : await storeWeekCards(company.id, weekOf, cards);
  return { slug: company.slug, name: company.name, weekOf, cards, stored };
}
