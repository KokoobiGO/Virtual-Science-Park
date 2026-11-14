/**
 * The "Your week" cards (A17), against the real database: storing replaces a
 * week's cards, and a member reads only its own company's cards (the policy
 * week_cards_own_read in drizzle/0004_matching_tables.sql).
 *
 * Every write happens inside a transaction that is rolled back, so the
 * database is left exactly as it was found. Needs the gold members and their
 * ranked matches (npm run match). Skips itself when DATABASE_URL is not set.
 */
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { storeWeekCards } from "../lib/cards/build";
import type { CardDraft } from "../lib/cards/select";
import { mondayOf } from "../lib/cards/week";
import { closeDb, getDb } from "../lib/db";
import { companies, matches, weekCards } from "../lib/db/schema";
import type { UserTx } from "../lib/db/user";

const configured = Boolean(process.env.DATABASE_URL);

class Rollback extends Error {}

/** Runs `work` in a service transaction that is always rolled back. */
async function rolledBack(work: (tx: UserTx) => Promise<void>): Promise<void> {
  try {
    await getDb().transaction(async (tx) => {
      await work(tx);
      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
}

/** From here on in this transaction, read as a signed-in member of this company. */
async function readAsMember(tx: UserTx, companyId: string) {
  const claims = { sub: randomUUID(), role: "authenticated", app_metadata: { role: "member", company_id: companyId } };
  await tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`);
  await tx.execute(sql`set local role authenticated`);
  return tx.select({ companyId: weekCards.companyId, position: weekCards.position, title: weekCards.title }).from(weekCards).orderBy(asc(weekCards.position));
}

const card = (position: number, opportunityId: string, title: string): CardDraft => ({
  position,
  kind: "match",
  opportunityId,
  trendNoteId: null,
  title,
  why: "Test why.",
  nextStep: "Test next step.",
  uncertainties: ["Test uncertainty"],
  sources: [{ url: "https://example.org", title }],
});

describe.skipIf(!configured)("week cards in the database", () => {
  afterAll(closeDb);

  it("replaces a week's cards and shows them to the company's own members only", async () => {
    const gold = await getDb()
      .select({ id: companies.id, slug: companies.slug })
      .from(companies)
      .where(inArray(companies.slug, ["embeddedart", "malvacom"]))
      .orderBy(asc(companies.slug));
    expect(gold.map((g) => g.slug)).toEqual(["embeddedart", "malvacom"]);
    const [embeddedart, malvacom] = gold;
    const ranked = await getDb()
      .select({ opportunityId: matches.opportunityId })
      .from(matches)
      .where(and(eq(matches.companyId, embeddedart.id), eq(matches.mode, "personal"), isNotNull(matches.rank)))
      .orderBy(asc(matches.rank))
      .limit(3);
    expect(ranked.length).toBe(3);
    // A week far from now, so the test never meets the real cards.
    const weekOf = mondayOf(new Date("2030-06-05T12:00:00Z"));
    expect(weekOf).toBe("2030-06-03");

    await rolledBack(async (tx) => {
      const first = [card(1, ranked[0].opportunityId, "First A"), card(2, ranked[1].opportunityId, "First B"), card(3, ranked[2].opportunityId, "First C")];
      expect(await storeWeekCards(embeddedart.id, weekOf, first, { db: tx })).toBe(3);
      const second = [card(1, ranked[2].opportunityId, "Second A"), card(2, ranked[0].opportunityId, "Second B")];
      expect(await storeWeekCards(embeddedart.id, weekOf, second, { db: tx })).toBe(2);

      const stored = await tx
        .select({ position: weekCards.position, title: weekCards.title })
        .from(weekCards)
        .where(and(eq(weekCards.companyId, embeddedart.id), eq(weekCards.weekOf, weekOf)))
        .orderBy(asc(weekCards.position));
      expect(stored).toEqual([
        { position: 1, title: "Second A" },
        { position: 2, title: "Second B" },
      ]);

      // Another member sees none of EmbeddedArt's cards, whatever week.
      const asMalvacom = await readAsMember(tx, malvacom.id);
      expect(asMalvacom.filter((c) => c.companyId === embeddedart.id)).toEqual([]);
      // EmbeddedArt's own member sees them.
      const asEmbeddedArt = await readAsMember(tx, embeddedart.id);
      expect(asEmbeddedArt.every((c) => c.companyId === embeddedart.id)).toBe(true);
      expect(asEmbeddedArt.map((c) => c.title)).toEqual(expect.arrayContaining(["Second A", "Second B"]));
    });

    const left = await getDb().select({ id: weekCards.id }).from(weekCards).where(eq(weekCards.weekOf, weekOf));
    expect(left).toEqual([]);
  });
});
