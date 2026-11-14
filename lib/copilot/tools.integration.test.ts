/**
 * The Copilot's tools (B6) against the real database, as two different member
 * companies: each tool returns and writes data for the signed-in member's own
 * company only, even when the model passes another company's id.
 *
 * Every write happens in a transaction that is rolled back, so the database is
 * left as it was. The tools run exactly as in a request: as the `authenticated`
 * role with the member's claims, so row-level security applies. Needs the gold
 * members with judged matches. Skips itself when DATABASE_URL is not set.
 */
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNotNull, notInArray, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../db";
import { chats, companies, handoffs, matches, opportunities, savedItems } from "../db/schema";
import type { UserTx } from "../db/user";
import { handoffFromAnswer } from "./handoff";
import { SourceRegistry } from "./sources";
import { loadHistory, storeTurn } from "./store";
import { makeToolExecutor, type DbRunner, type ToolContext } from "./tools";

const configured = Boolean(process.env.DATABASE_URL);

class Rollback extends Error {}

/** Runs `work` in a transaction that is always rolled back. */
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

/** From here on in this transaction, act as a signed-in member of this company. */
async function actAs(tx: UserTx, ctx: ToolContext) {
  const claims = { sub: ctx.userId, role: "authenticated", app_metadata: { role: "member", company_id: ctx.companyId } };
  await tx.execute(sql`reset role`);
  await tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`);
  await tx.execute(sql`set local role authenticated`);
}

const member = (companyId: string): ToolContext => ({ companyId, userId: randomUUID(), threadId: randomUUID(), question: "Test question" });

describe.skipIf(!configured)("Copilot tools in the database, as two companies", () => {
  afterAll(closeDb);

  it("each tool reads and writes the signed-in member's own company only", async () => {
    const gold = await getDb()
      .select({ id: companies.id, slug: companies.slug, name: companies.name })
      .from(companies)
      .where(inArray(companies.slug, ["embeddedart", "malvacom"]))
      .orderBy(asc(companies.slug));
    expect(gold.map((g) => g.slug)).toEqual(["embeddedart", "malvacom"]);
    const [embeddedart, malvacom] = gold;

    // An opportunity Malvacom has a kept match for and EmbeddedArt has not.
    const embeddedartOpportunities = getDb().select({ id: matches.opportunityId }).from(matches).where(eq(matches.companyId, embeddedart.id));
    const [onlyMalvacom] = await getDb()
      .select({ id: matches.opportunityId })
      .from(matches)
      .where(and(eq(matches.companyId, malvacom.id), eq(matches.rejected, false), isNotNull(matches.why), isNotNull(matches.rank), notInArray(matches.opportunityId, embeddedartOpportunities)))
      .limit(1);
    expect(onlyMalvacom, "Malvacom needs a kept match EmbeddedArt does not have").toBeDefined();

    await rolledBack(async (tx) => {
      const db: DbRunner = (run) => run(tx);
      const a = member(embeddedart.id);
      const b = member(malvacom.id);

      // --- As EmbeddedArt -----------------------------------------------------
      await actAs(tx, a);
      const sourcesA = new SourceRegistry();
      const toolsA = makeToolExecutor(db, a, sourcesA);

      // getMyProfile: EmbeddedArt's own profile, also when the model asks for Malvacom's.
      const profile = JSON.parse((await toolsA("getMyProfile", JSON.stringify({ companyId: malvacom.id }))).content);
      expect(profile.company.name).toBe(embeddedart.name);
      expect(JSON.stringify(profile)).not.toContain(malvacom.name);

      // explainMatch: Malvacom's match is not found, and the default list is EmbeddedArt's own.
      const theirs = JSON.parse((await toolsA("explainMatch", JSON.stringify({ opportunityId: onlyMalvacom.id, companyId: malvacom.id }))).content);
      expect(theirs.matches).toEqual([]);
      const own = JSON.parse((await toolsA("explainMatch", "{}")).content);
      expect(own.matches.length).toBeGreaterThan(0);
      const ownIds = (await getDb().select({ id: matches.opportunityId }).from(matches).where(eq(matches.companyId, embeddedart.id))).map((m) => m.id);
      for (const m of own.matches) expect(ownIds).toContain(m.opportunityId);
      expect(own.matches[0].cite).toMatch(/^\[\d+\]$/);

      // searchOpportunities: real opportunities only, never fixtures, each with a cite number.
      const search = JSON.parse((await toolsA("searchOpportunities", JSON.stringify({ query: "underwater sensor marine", kind: "testbed" }))).content);
      expect(search.results.length).toBeGreaterThan(0);
      const found = await tx.select({ externalId: opportunities.externalId }).from(opportunities).where(inArray(opportunities.id, search.results.map((r: { opportunityId: string }) => r.opportunityId)));
      expect(found.every((o) => !o.externalId.startsWith("fixture-"))).toBe(true);
      expect(search.results.every((r: { cite: string; kind: string }) => /^\[\d+\]$/.test(r.cite) && r.kind === "test facility")).toBe(true);

      // D20: the hand-entered testbeds carry their label, and every source date reads like the screens ("14 Nov 2026").
      const testbeds = sourcesA.all().filter((s) => s.publisher === "Curated testbed list");
      expect(testbeds.length).toBeGreaterThan(0);
      expect(testbeds.every((s) => s.label === "hand_entered")).toBe(true);
      expect(sourcesA.all().flatMap((s) => s.dates).every((d) => /^[a-z]+ \d{1,2} [A-Z][a-z]{2,3} \d{4}$/.test(d))).toBe(true);
      // The tools still give the model YYYY-MM-DD, as its prompt asks.
      expect(search.results.every((r: { deadline?: string }) => r.deadline === undefined || /^\d{4}-\d{2}-\d{2}$/.test(r.deadline))).toBe(true);

      // An empty query with closesBefore lists what closes by then, soonest first.
      const closing = JSON.parse((await toolsA("searchOpportunities", JSON.stringify({ query: "", kind: "funding", closesBefore: "2099-12-31" }))).content);
      const deadlines: string[] = closing.results.map((r: { deadline: string }) => r.deadline);
      expect(deadlines.length).toBeGreaterThan(0);
      expect(deadlines).toEqual([...deadlines].sort());

      // saveOpportunity and contactStaff write under EmbeddedArt, whatever company id the model passes.
      const saved = await toolsA("saveOpportunity", JSON.stringify({ opportunityId: onlyMalvacom.id, companyId: malvacom.id }));
      expect(saved.ok).toBe(true);
      const sent = await toolsA("contactStaff", JSON.stringify({ topic: "Test", message: "Copilot privacy test handoff", companyId: malvacom.id }));
      expect(sent.handoffId).toBeDefined();

      // The chat turn is stored under EmbeddedArt.
      const turn = await storeTurn(tx, {
        companyId: a.companyId,
        userId: a.userId,
        threadId: a.threadId,
        message: "Copilot privacy test question",
        askedAt: new Date(),
        label: "in_scope",
        answer: "Copilot privacy test answer",
        citations: [],
      });
      expect((await loadHistory(tx, a)).map((h) => h.role)).toEqual(["user", "assistant"]);
      const button = await handoffFromAnswer(tx, a, { threadId: a.threadId, chatId: turn.assistantChatId });
      expect(button?.alreadySent).toBe(false);
      expect((await handoffFromAnswer(tx, a, { threadId: a.threadId, chatId: turn.assistantChatId }))?.alreadySent).toBe(true);

      // --- As Malvacom --------------------------------------------------------
      await actAs(tx, b);
      const toolsB = makeToolExecutor(db, b, new SourceRegistry());
      const profileB = JSON.parse((await toolsB("getMyProfile", "{}")).content);
      expect(profileB.company.name).toBe(malvacom.name);

      // None of EmbeddedArt's saved items, handoffs or chats are visible to Malvacom.
      expect(await tx.select().from(savedItems).where(eq(savedItems.companyId, embeddedart.id))).toEqual([]);
      expect(await tx.select().from(handoffs).where(eq(handoffs.companyId, embeddedart.id))).toEqual([]);
      expect(await tx.select().from(chats).where(eq(chats.threadId, a.threadId))).toEqual([]);
      expect(await loadHistory(tx, { companyId: embeddedart.id, threadId: a.threadId })).toEqual([]);
      // Nor can Malvacom hand EmbeddedArt's answer to staff.
      expect(await handoffFromAnswer(tx, b, { threadId: a.threadId, chatId: turn.assistantChatId })).toBeNull();

      // --- As the table owner: where the rows really went ----------------------
      await tx.execute(sql`reset role`);
      const savedRows = await tx.select({ companyId: savedItems.companyId, userId: savedItems.userId }).from(savedItems).where(eq(savedItems.opportunityId, onlyMalvacom.id));
      expect(savedRows).toContainEqual({ companyId: embeddedart.id, userId: a.userId });
      expect(savedRows.some((r) => r.companyId === malvacom.id && r.userId === a.userId)).toBe(false);
      const handoffRows = await tx.select({ companyId: handoffs.companyId, context: handoffs.context }).from(handoffs).where(eq(handoffs.userId, a.userId));
      expect(handoffRows).toHaveLength(2);
      expect(handoffRows.every((h) => h.companyId === embeddedart.id)).toBe(true);
      const chatRows = await tx.select({ companyId: chats.companyId }).from(chats).where(eq(chats.threadId, a.threadId));
      expect(chatRows).toEqual([{ companyId: embeddedart.id }, { companyId: embeddedart.id }]);
    });

    // Nothing was left behind.
    expect(await getDb().select({ id: handoffs.id }).from(handoffs).where(sql`${handoffs.message} like 'Copilot privacy test%'`)).toEqual([]);
  });

  it("a member cannot write a chat, saved item or handoff for another company (row-level security)", async () => {
    const [embeddedart, malvacom] = await getDb()
      .select({ id: companies.id })
      .from(companies)
      .where(inArray(companies.slug, ["embeddedart", "malvacom"]))
      .orderBy(asc(companies.slug));
    const a = member(embeddedart.id);
    for (const write of [
      (tx: UserTx) => tx.insert(chats).values({ companyId: malvacom.id, userId: a.userId, threadId: a.threadId, role: "user", content: "x" }),
      (tx: UserTx) => tx.insert(handoffs).values({ companyId: malvacom.id, userId: a.userId, topic: "x", message: "x", contactRoute: "x" }),
    ]) {
      const error = await rolledBack(async (tx) => {
        await actAs(tx, a);
        await write(tx);
      }).catch((e: Error & { cause?: Error }) => e);
      expect(error).toBeInstanceOf(Error);
      expect(`${(error as Error).message} ${(error as Error & { cause?: Error }).cause?.message ?? ""}`).toMatch(/row-level security/);
    }
  });
});
