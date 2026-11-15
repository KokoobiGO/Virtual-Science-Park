/**
 * The Your-week reads and the card buttons (C3, C4) against the real
 * database, run the way a request runs them: as a signed-in member, so the
 * row-level security policies decide (saved_items_own, feedback_own,
 * handoffs_member_insert, handoffs_read, week_cards_own_read).
 *
 * Every write happens inside a transaction that is rolled back, so the
 * database is left exactly as it was found. Skips itself when DATABASE_URL is
 * not set.
 */
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../db";
import { companies, feedback, handoffs, opportunities, savedItems, sourceStatus, weekCards } from "../db/schema";
import type { UserTx } from "../db/user";
import { askBspAboutOpportunity } from "./handoff";
import { loadCalendarItem, loadWeek, loadWeekStatus } from "./load";
import { setFeedback, setSaved } from "./store";

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

/** From here on in this transaction, act as a signed-in member of this company, as withUserDb() does. */
async function actAsMember(tx: UserTx, companyId: string, userId: string) {
  const claims = { sub: userId, role: "authenticated", app_metadata: { role: "member", company_id: companyId } };
  await tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`);
  await tx.execute(sql`set local role authenticated`);
}

/** True when `write` is refused; runs in a savepoint so the transaction goes on. */
async function refused(tx: UserTx, write: (sp: UserTx) => Promise<unknown>): Promise<boolean> {
  try {
    await tx.transaction(async (sp) => {
      await write(sp);
    });
    return false;
  } catch {
    return true;
  }
}

describe.skipIf(!configured)("Your week as a signed-in member", () => {
  afterAll(closeDb);

  it("stores and removes saves, feedback and questions to BSP for its own company only", async () => {
    const gold = await getDb()
      .select({ id: companies.id, slug: companies.slug })
      .from(companies)
      .where(inArray(companies.slug, ["embeddedart", "malvacom"]))
      .orderBy(asc(companies.slug));
    expect(gold.map((g) => g.slug)).toEqual(["embeddedart", "malvacom"]);
    const [embeddedart, malvacom] = gold;
    const opps = await getDb()
      .select({ id: opportunities.id, title: opportunities.title, externalId: opportunities.externalId, source: opportunities.source })
      .from(opportunities)
      .where(isNotNull(opportunities.deadline))
      .orderBy(asc(opportunities.id))
      .limit(2);
    expect(opps).toHaveLength(2);
    const [first, second] = opps;
    const userId = randomUUID();
    const me = { companyId: embeddedart.id, userId };
    // A week far from now, so the test is the newest week inside its transaction.
    const weekOf = "2030-06-03";

    await rolledBack(async (tx) => {
      // As the job would: two cards for EmbeddedArt, written before switching to the member.
      await tx.insert(weekCards).values([
        { companyId: embeddedart.id, weekOf, position: 1, kind: "match", opportunityId: first.id, title: first.title, why: "Test why.", nextStep: "Test next step.", uncertainties: ["Test open point"], sources: [{ url: "https://example.org/a" }] },
        { companyId: embeddedart.id, weekOf, position: 2, kind: "match", opportunityId: second.id, title: second.title, why: "Test why 2.", nextStep: "Test next step 2.", sources: [{ url: "https://example.org/b" }] },
      ]);
      await actAsMember(tx, embeddedart.id, userId);

      // Save and unsave.
      expect(await setSaved(tx, { ...me, opportunityId: first.id, saved: true })).toBe(true);
      expect(await setSaved(tx, { ...me, opportunityId: first.id, saved: true })).toBe(true); // twice is fine
      const savedRows = await tx.select().from(savedItems).where(eq(savedItems.companyId, embeddedart.id));
      expect(savedRows.map((r) => r.opportunityId)).toContain(first.id);

      // Feedback: set, change, and clear.
      await setFeedback(tx, { ...me, opportunityId: first.id, kind: "useful" });
      await setFeedback(tx, { ...me, opportunityId: first.id, kind: "not_relevant" });
      const mine = () =>
        tx.select({ kind: feedback.kind }).from(feedback).where(and(eq(feedback.userId, userId), eq(feedback.opportunityId, first.id)));
      expect(await mine()).toEqual([{ kind: "not_relevant" }]);
      await setFeedback(tx, { ...me, opportunityId: second.id, kind: "useful" });

      // Ask BSP: one open question per opportunity.
      const asked = await askBspAboutOpportunity(tx, { ...me, opportunityId: first.id });
      expect(asked?.created).toBe(true);
      const again = await askBspAboutOpportunity(tx, { ...me, opportunityId: first.id });
      expect(again).toEqual({ handoffId: asked!.handoffId, created: false });
      const [handoff] = await tx.select().from(handoffs).where(eq(handoffs.id, asked!.handoffId));
      expect(handoff).toMatchObject({ companyId: embeddedart.id, userId, contactRoute: "your_week", status: "open" });
      expect(handoff.context).toMatchObject({ from: "your_week", opportunityId: first.id });
      expect(await askBspAboutOpportunity(tx, { ...me, opportunityId: randomUUID() })).toBeNull();

      // The screen reads it all back.
      const week = await loadWeek(tx, me);
      expect(week.weekOf).toBe(weekOf);
      expect(week.cards.map((c) => [c.position, c.saved, c.feedback, c.askedBsp])).toEqual([
        [1, true, "not_relevant", true],
        [2, false, "useful", false],
      ]);
      expect(week.cards[0].opportunity).toMatchObject({ id: first.id });
      expect(week.cards[0].uncertainties).toEqual(["Test open point"]);
      // The data status label's inputs (D20): the external id and the state of the source, read as the member.
      for (const [card, opp] of [
        [week.cards[0], first],
        [week.cards[1], second],
      ] as const) {
        const [source] = await getDb()
          .select({ state: sourceStatus.state, cachedAt: sourceStatus.cachedAt })
          .from(sourceStatus)
          .where(eq(sourceStatus.label, opp.source));
        expect(card.opportunity).toMatchObject({
          externalId: opp.externalId,
          sourceState: source?.state ?? null,
          cachedAt: source?.cachedAt ?? null,
        });
      }
      // Keys stay the same when the cards are built again; the build time is what the page polls for.
      expect(week.cards.map((c) => c.key)).toEqual([`opportunity:${first.id}`, `opportunity:${second.id}`]);
      expect(week.builtAt).toBeInstanceOf(Date);
      const status = await loadWeekStatus(tx, embeddedart.id);
      expect(status).toMatchObject({ weekOf, builtAt: week.builtAt });
      expect(status.profileChangedAt).toBeInstanceOf(Date);
      expect(await loadCalendarItem(tx, first.id)).toMatchObject({ opportunityId: first.id, title: first.title });

      // Clear and unsave.
      await setFeedback(tx, { ...me, opportunityId: first.id, kind: null });
      expect(await mine()).toEqual([]);
      await setSaved(tx, { ...me, opportunityId: first.id, saved: false });
      expect((await loadWeek(tx, me)).cards[0]).toMatchObject({ saved: false, feedback: null });

      // Row-level security: nothing for another company, nothing under another user id.
      expect(await refused(tx, (sp) => sp.insert(savedItems).values({ companyId: malvacom.id, userId, opportunityId: first.id }))).toBe(true);
      expect(await refused(tx, (sp) => sp.insert(feedback).values({ companyId: malvacom.id, userId, opportunityId: first.id, kind: "useful" }))).toBe(true);
      expect(await refused(tx, (sp) => sp.insert(feedback).values({ companyId: embeddedart.id, userId: randomUUID(), opportunityId: first.id, kind: "useful" }))).toBe(true);
      expect(
        await refused(tx, (sp) =>
          sp.insert(handoffs).values({ companyId: malvacom.id, userId, topic: "x", message: "x", contactRoute: "your_week" }),
        ),
      ).toBe(true);
      // Malvacom's cards stay hidden from EmbeddedArt's member, whatever is stored.
      expect(await loadWeek(tx, { companyId: malvacom.id, userId })).toEqual({ weekOf: null, builtAt: null, cards: [] });
    });

    const left = await getDb().select({ id: weekCards.id }).from(weekCards).where(eq(weekCards.weekOf, weekOf));
    expect(left).toEqual([]);
  });
});
