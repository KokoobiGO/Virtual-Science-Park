/**
 * Row-level security (B14): a member account gets zero rows of another
 * company's private data. Techinova's member reads EmbeddedArt's rows.
 *
 * tests/privacy.integration.test.ts already covers private claims, chats and
 * the first look at company_private and matches; tests/cards.integration.test.ts
 * covers week_cards. This file adds the tables nobody tested yet (briefs,
 * saved_items, feedback, handoffs), and checks personal matches and the
 * company_private row again with a row that is known to exist, so an empty
 * answer cannot pass by accident.
 *
 * Each test writes as the table owner inside a transaction that is always
 * rolled back, then reads in the same transaction as a signed-in member (the
 * `authenticated` role and JWT claims, as lib/db/user.ts does for requests):
 * once as another company's member, once as the owning company's member, so
 * the test also proves the rows are there to be hidden. Needs a database with
 * the gold members and their matches; skips itself when DATABASE_URL is not set.
 */
import { randomUUID } from "node:crypto";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../lib/db";
import { briefs, companies, companyPrivate, feedback, handoffs, matches, opportunities, savedItems } from "../lib/db/schema";
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
}

type Seen = { owner: number; otherMember: number; ownMember: number };

describe.skipIf(!configured)("row-level security: another company's private rows (B14)", () => {
  /** The member who must see nothing. */
  let reader: string;
  /** The company whose rows are private. */
  let owner: string;
  let opportunityId: string;

  beforeAll(async () => {
    const gold = await getDb()
      .select({ id: companies.id, slug: companies.slug })
      .from(companies)
      .where(inArray(companies.slug, ["techinova", "embeddedart"]));
    const id = (slug: string) => gold.find((c) => c.slug === slug)?.id;
    reader = id("techinova")!;
    owner = id("embeddedart")!;
    const [opportunity] = await getDb().select({ id: opportunities.id }).from(opportunities).limit(1);
    opportunityId = opportunity?.id;
    expect(reader && owner && opportunityId, "needs the techinova and embeddedart members and one opportunity").toBeTruthy();
  });

  afterAll(closeDb);

  /** Writes with `seed` as the owner, then counts the owner company's rows as the owner, as Techinova's member and as EmbeddedArt's member. */
  async function visibility(seed: (tx: UserTx) => Promise<unknown>, countRows: (tx: UserTx) => Promise<number>): Promise<Seen> {
    let seen: Seen | undefined;
    await rolledBack(async (tx) => {
      await seed(tx);
      const ownerCount = await countRows(tx);
      await readAsMember(tx, reader);
      const otherMember = await countRows(tx);
      await readAsMember(tx, owner);
      const ownMember = await countRows(tx);
      seen = { owner: ownerCount, otherMember, ownMember };
    });
    return seen!;
  }

  /** Rows are there, another member gets none, the company's own member gets all of them. */
  function expectHidden(seen: Seen) {
    expect(seen.owner).toBeGreaterThan(0);
    expect(seen.otherMember).toBe(0);
    expect(seen.ownMember).toBe(seen.owner);
  }

  const nothing = async () => undefined;

  it("gets no Scout briefs of another company", async () => {
    const seen = await visibility(
      (tx) => tx.insert(briefs).values({ companyId: owner, userId: randomUUID(), question: "Privacy test: a private Scout question" }),
      async (tx) => (await tx.select({ n: count() }).from(briefs).where(eq(briefs.companyId, owner)))[0].n,
    );
    expectHidden(seen);
  });

  it("gets no saved items of another company", async () => {
    const seen = await visibility(
      (tx) => tx.insert(savedItems).values({ companyId: owner, opportunityId, userId: randomUUID() }).onConflictDoNothing(),
      async (tx) => (await tx.select({ n: count() }).from(savedItems).where(eq(savedItems.companyId, owner)))[0].n,
    );
    expectHidden(seen);
  });

  it("gets no feedback of another company", async () => {
    const seen = await visibility(
      (tx) => tx.insert(feedback).values({ companyId: owner, userId: randomUUID(), opportunityId, kind: "not_relevant" }),
      async (tx) => (await tx.select({ n: count() }).from(feedback).where(eq(feedback.companyId, owner)))[0].n,
    );
    expectHidden(seen);
  });

  it("gets no handoffs of another company", async () => {
    const seen = await visibility(
      (tx) =>
        tx.insert(handoffs).values({
          companyId: owner,
          userId: randomUUID(),
          topic: "Privacy test",
          message: "Privacy test: a private question for BSP staff",
          contactRoute: "test",
        }),
      async (tx) => (await tx.select({ n: count() }).from(handoffs).where(eq(handoffs.companyId, owner)))[0].n,
    );
    expectHidden(seen);
  });

  it("gets no personal matches of another company, while that company has some", async () => {
    const seen = await visibility(nothing, async (tx) =>
      (await tx.select({ n: count() }).from(matches).where(and(eq(matches.companyId, owner), eq(matches.mode, "personal"))))[0].n,
    );
    expectHidden(seen);
  });

  it("gets no company_private row of another company, while that company has one", async () => {
    const seen = await visibility(
      (tx) => tx.insert(companyPrivate).values({ companyId: owner, userPriorities: ["Privacy test"] }).onConflictDoNothing(),
      async (tx) => (await tx.select({ n: count() }).from(companyPrivate).where(eq(companyPrivate.companyId, owner)))[0].n,
    );
    expectHidden(seen);
  });

  it("leaves nothing behind", async () => {
    const [left] = await getDb().select({ n: count() }).from(briefs).where(eq(briefs.question, "Privacy test: a private Scout question"));
    const [handoffsLeft] = await getDb().select({ n: count() }).from(handoffs).where(eq(handoffs.topic, "Privacy test"));
    expect(left.n + handoffsLeft.n).toBe(0);
  });
});
