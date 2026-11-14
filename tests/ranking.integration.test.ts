/**
 * The matcher's ranking (A15, A18, A22), against the real database.
 *
 * Every write happens inside a transaction that is rolled back, so the
 * database is left exactly as it was found. Needs the three gold members with
 * both embeddings (npm run enrich). Skips itself when DATABASE_URL is not set.
 *
 * A member's own client is built from hand-made claims (role "member" and the
 * company id in app_metadata), the same fields the policies in
 * drizzle/0002_rls.sql read from a real Supabase token.
 */
import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../lib/db";
import { companies, companyPrivate, feedback, matches, opportunities, savedItems } from "../lib/db/schema";
import { withUserDb, type JwtClaims, type UserTx } from "../lib/db/user";
import { DEMO_ACCOUNTS } from "../lib/demo-accounts";
import { rankCompany } from "../lib/matcher/rank";
import { kindsForPriorities, TOP_N, type RankedMatch } from "../lib/matcher/score";
import { isSkipped, rankAndStore, storeRanking } from "../lib/matcher/store";
import { combineScore, MatchMode, ScoreBreakdown, type OpportunityKind } from "../lib/schemas";

const configured = Boolean(process.env.DATABASE_URL);

const GOLD = DEMO_ACCOUNTS.flatMap((a) => (a.role === "member" ? [a.companySlug] : []));
/** One moment for every call, so urgency cannot move between two rankings. */
const NOW = new Date();

class Rollback extends Error {}

type Transaction = (run: (tx: UserTx) => Promise<void>) => Promise<unknown>;

const asService: Transaction = (run) => getDb().transaction(run);

function memberClaims(companyId: string): JwtClaims {
  return { sub: randomUUID(), role: "authenticated", app_metadata: { role: "member", company_id: companyId } };
}

const asMember =
  (companyId: string): Transaction =>
  (run) =>
    withUserDb(memberClaims(companyId), run);

/** Runs `work` in a transaction that is always rolled back, and returns what `work` returned. */
async function rolledBack<T>(transaction: Transaction, work: (tx: UserTx) => Promise<T>): Promise<T> {
  let result: { value: T } | undefined;
  try {
    await transaction(async (tx) => {
      result = { value: await work(tx) };
      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
  if (!result) throw new Error("The work did not finish.");
  return result.value;
}

const topFive = (rows: RankedMatch[]) => rows.slice(0, 5).map((r) => r.opportunityId);
const order = (rows: RankedMatch[]) => rows.map((r) => `${r.opportunityId} ${r.score}`);

async function timed<T>(work: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const started = performance.now();
  const value = await work();
  return { value, ms: performance.now() - started };
}

describe.skipIf(!configured)("matcher ranking", () => {
  let ids: Record<string, string>;

  beforeAll(async () => {
    const rows = await getDb().select({ id: companies.id, slug: companies.slug }).from(companies).where(eq(companies.isGold, true));
    ids = Object.fromEntries(rows.map((r) => [r.slug, r.id]));
    expect(Object.keys(ids).sort()).toEqual([...GOLD].sort());
  });

  afterAll(closeDb);

  it("gives each gold member a ranked top 20 in both modes (A15)", async () => {
    for (const slug of GOLD) {
      for (const mode of MatchMode.options) {
        const rows = await rankCompany(getDb(), ids[slug], mode, { now: NOW });
        expect(rows, `${slug} ${mode}`).toHaveLength(TOP_N);
        expect(rows.map((r) => r.rank)).toEqual(Array.from({ length: TOP_N }, (_, i) => i + 1));
        expect(rows.map((r) => r.score)).toEqual([...rows.map((r) => r.score)].sort((a, b) => b - a));
        for (const row of rows) {
          expect(ScoreBreakdown.parse(row.scoreBreakdown)).toEqual(row.scoreBreakdown);
          expect(combineScore(row.scoreBreakdown)).toBe(row.score);
          if (mode === "public") expect([row.scoreBreakdown.priorityBoost, row.scoreBreakdown.feedback]).toEqual([0, 0]);
        }
      }
    }
  });

  it("gives the three gold members different top fives from the same pool", async () => {
    const fives = await Promise.all(GOLD.map(async (slug) => topFive(await rankCompany(getDb(), ids[slug], "public", { now: NOW }))));
    for (let a = 0; a < fives.length; a++) {
      for (let b = a + 1; b < fives.length; b++) expect(fives[a], `${GOLD[a]} vs ${GOLD[b]}`).not.toEqual(fives[b]);
    }
  });

  it("rescales the similarity after taking off each opportunity's average similarity to all companies", async () => {
    const embeddedart = ids.embeddedart;
    const pool = await rankCompany(getDb(), embeddedart, "public", { now: NOW, limit: 10_000 });
    expect(pool.length).toBeGreaterThan(TOP_N);
    // The plain way: one cosine similarity per company, averaged.
    const raw = await getDb().execute<{ id: string; sim: number; typical: number }>(sql`
      select o.id,
        1 - (o.embedding <=> (select public_embedding from companies where id = ${embeddedart})) as sim,
        (select avg(1 - (o.embedding <=> c.public_embedding)) from companies c where c.public_embedding is not null) as typical
      from opportunities o
      where o.id in ${pool.map((r) => r.opportunityId)}`);
    const adjusted = new Map(raw.map((r) => [r.id, r.sim - r.typical]));
    const values = [...adjusted.values()];
    const [lo, hi] = [Math.min(...values), Math.max(...values)];
    for (const row of pool) {
      expect(row.scoreBreakdown.similarity, row.opportunityId).toBeCloseTo((adjusted.get(row.opportunityId)! - lo) / (hi - lo), 2);
    }
  });

  it("leaves news about the company itself out of its pool", async () => {
    const [techinova, embeddedart] = [ids.techinova, ids.embeddedart];
    const result = await rolledBack(asService, async (tx) => {
      // A news item that names Techinova (in capitals) and reads exactly like its profile.
      const [news] = await tx.execute<{ id: string }>(sql`
        insert into opportunities (kind, source, external_id, title, url, published_at, retrieved_at, embedding, tags)
        select 'news'::opportunity_kind, 'Ranking test', 'test-self-news', 'Nytt pris till TECHINOVA', 'https://example.test/news', ${NOW.toISOString()}::timestamptz,
          ${NOW.toISOString()}::timestamptz, public_embedding, tags
        from companies where id = ${techinova}
        returning id`);
      const pool = (id: string, mode: MatchMode) => rankCompany(tx, id, mode, { now: NOW, limit: 10_000 });
      return {
        id: news.id,
        techinova: [...(await pool(techinova, "personal")), ...(await pool(techinova, "public"))].map((r) => r.opportunityId),
        embeddedart: (await pool(embeddedart, "public")).map((r) => r.opportunityId),
      };
    });
    expect(result.techinova.length).toBeGreaterThan(TOP_N);
    expect(result.techinova).not.toContain(result.id);
    expect(result.embeddedart).toContain(result.id);
  });

  it("leaves a mode alone when the company has no embedding for it", async () => {
    const embeddedart = ids.embeddedart;
    const result = await rolledBack(asService, async (tx) => {
      const stored = () => tx.select().from(matches).where(and(eq(matches.companyId, embeddedart), eq(matches.mode, "personal"))).orderBy(matches.id);
      const before = await stored();
      await tx.update(companyPrivate).set({ personalEmbedding: null }).where(eq(companyPrivate.companyId, embeddedart));
      const outcome = await rankAndStore(embeddedart, { now: NOW, db: tx });
      return { before, outcome, after: await stored() };
    });
    expect(result.outcome.personal).toEqual({ skipped: "no personal embedding" });
    expect(isSkipped(result.outcome.public) ? null : result.outcome.public.ranked).toBe(TOP_N);
    expect(result.before.filter((r) => r.rank !== null).length).toBeGreaterThan(0);
    expect(result.after).toEqual(result.before);
  });

  it("changes the order after a profile edit", async () => {
    const [embeddedart, malvacom] = [ids.embeddedart, ids.malvacom];
    const tagsBefore = (await getDb().select({ tags: companies.tags }).from(companies).where(eq(companies.id, embeddedart)))[0].tags;
    const before = await rankCompany(getDb(), embeddedart, "public", { now: NOW });

    // EmbeddedArt's public profile becomes Malvacom's: its tags and its public embedding.
    const after = await rolledBack(asService, async (tx) => {
      await tx.execute(sql`
        update companies set tags = other.tags, public_embedding = other.public_embedding
        from companies other
        where companies.id = ${embeddedart} and other.id = ${malvacom}`);
      // The judge's rejections differ per company and leave the pool: clear them here so both rank the same pool.
      await tx.update(matches).set({ rejected: false }).where(inArray(matches.companyId, [embeddedart, malvacom]));
      return { embeddedart: await rankCompany(tx, embeddedart, "public", { now: NOW }), malvacom: await rankCompany(tx, malvacom, "public", { now: NOW }) };
    });

    expect(topFive(after.embeddedart)).not.toEqual(topFive(before));
    // Same pool, same profile: the same order as Malvacom's.
    expect(topFive(after.embeddedart)).toEqual(topFive(after.malvacom));
    // And the edit is gone again.
    const tagsAfter = (await getDb().select({ tags: companies.tags }).from(companies).where(eq(companies.id, embeddedart)))[0].tags;
    expect(tagsAfter).toEqual(tagsBefore);
    expect(order(await rankCompany(getDb(), embeddedart, "public", { now: NOW }))).toEqual(order(before));
  });

  it("changes the personal ranking but not the public one when a private priority is switched on, within a second (A18)", async () => {
    const embeddedart = ids.embeddedart;
    const member = asMember(embeddedart);
    const before = await rolledBack(member, async (tx) => {
      const [own] = await tx.select({ priorities: companyPrivate.userPriorities }).from(companyPrivate).where(eq(companyPrivate.companyId, embeddedart));
      return {
        priorities: own.priorities,
        personal: await rankCompany(tx, embeddedart, "personal", { now: NOW }),
        public: await rankCompany(tx, embeddedart, "public", { now: NOW }),
      };
    });
    const switchedOn = !before.priorities.includes("events");
    const priorities = switchedOn ? [...before.priorities, "events"] : before.priorities.filter((p) => p !== "events");

    // The member's own client: switch the priority and read the new order in the same transaction.
    const after = await rolledBack(member, async (tx) => {
      const edited = await tx
        .update(companyPrivate)
        .set({ userPriorities: priorities })
        .where(eq(companyPrivate.companyId, embeddedart))
        .returning({ companyId: companyPrivate.companyId });
      expect(edited).toHaveLength(1);
      const personal = await timed(() => rankCompany(tx, embeddedart, "personal", { now: NOW }));
      return { personal: personal.value, ms: personal.ms, public: await rankCompany(tx, embeddedart, "public", { now: NOW }) };
    });
    console.log(`priority "events" switched ${switchedOn ? "on" : "off"}: new personal order in ${after.ms.toFixed(0)} ms`);

    expect(order(after.personal)).not.toEqual(order(before.personal));
    expect(after.public).toEqual(before.public);
    expect(after.ms).toBeLessThan(1000);
    const kinds = new Map((await getDb().execute<{ id: string; kind: string }>(sql`select id, kind from opportunities`)).map((r) => [r.id, r.kind]));
    // The boost follows the fit: the rescaled similarity for a boosted kind, 0 otherwise.
    const boosted = new Set(kindsForPriorities(priorities));
    for (const row of after.personal) {
      const kind = kinds.get(row.opportunityId) as OpportunityKind;
      expect(row.scoreBreakdown.priorityBoost).toBe(boosted.has(kind) ? row.scoreBreakdown.similarity : 0);
    }
    if (switchedOn) expect(after.personal.some((r) => kinds.get(r.opportunityId) === "event" && r.scoreBreakdown.priorityBoost > 0)).toBe(true);

    // Rolled back: the stored priorities are what they were.
    const [stored] = await getDb().select({ priorities: companyPrivate.userPriorities }).from(companyPrivate).where(eq(companyPrivate.companyId, embeddedart));
    expect(stored.priorities).toEqual(before.priorities);
  });

  it("uses the member's own feedback and saved items in personal mode only", async () => {
    const embeddedart = ids.embeddedart;
    const claims = memberClaims(embeddedart);
    const result = await rolledBack(
      (run) => withUserDb(claims, run),
      async (tx) => {
        const before = { personal: await rankCompany(tx, embeddedart, "personal", { now: NOW }), public: await rankCompany(tx, embeddedart, "public", { now: NOW }) };
        const [dismissed, useful, saved] = [before.personal[0], before.personal[5], before.personal[10]].map((r) => r.opportunityId);
        const mark = { companyId: embeddedart, userId: claims.sub };
        await tx.insert(feedback).values([
          { ...mark, opportunityId: useful, kind: "useful" },
          { ...mark, opportunityId: dismissed, kind: "not_relevant" },
        ]);
        await tx.insert(savedItems).values({ ...mark, opportunityId: saved });
        const after = { personal: await rankCompany(tx, embeddedart, "personal", { now: NOW }), public: await rankCompany(tx, embeddedart, "public", { now: NOW }) };
        const tags = new Map(
          (await tx.select({ id: opportunities.id, tags: opportunities.tags }).from(opportunities).where(inArray(opportunities.id, after.personal.map((r) => r.opportunityId).concat(dismissed, useful, saved)))).map((r) => [r.id, r.tags]),
        );
        return { before, after, dismissed, useful, saved, tags };
      },
    );
    const { after, dismissed, useful, saved, tags } = result;

    expect(after.personal.map((r) => r.opportunityId)).not.toContain(dismissed);
    expect(after.personal).toHaveLength(TOP_N);
    const jaccard = (a: string[], b: string[]) => {
      const union = new Set([...a, ...b]);
      return union.size ? a.filter((t) => b.includes(t)).length / union.size : 0;
    };
    const signals: [string, number][] = [[useful, 1], [dismissed, -1], [saved, 1]];
    for (const row of after.personal) {
      const own = row.opportunityId === useful || row.opportunityId === saved;
      const others = signals.filter(([id]) => id !== row.opportunityId);
      const expected = own ? 1 : others.reduce((sum, [id, sign]) => sum + sign * jaccard(tags.get(id)!, tags.get(row.opportunityId)!), 0) / others.length;
      // The SQL rounds each part to 3 decimals.
      expect(row.scoreBreakdown.feedback, row.opportunityId).toBeCloseTo(expected, 2);
      expect(combineScore(row.scoreBreakdown)).toBe(row.score);
    }
    expect(after.personal.some((r) => r.opportunityId !== useful && r.opportunityId !== saved && r.scoreBreakdown.feedback !== 0)).toBe(true);
    // Public mode never reads feedback.
    expect(after.public).toEqual(result.before.public);
  });

  it("ranks one gold member in under a second (warm)", async () => {
    const embeddedart = ids.embeddedart;
    await rankCompany(getDb(), embeddedart, "personal", { now: NOW }); // warm the connection and the plan
    const service: number[] = [];
    const member: number[] = [];
    for (let i = 0; i < 5; i++) {
      service.push((await timed(() => rankCompany(getDb(), embeddedart, "personal", { now: NOW }))).ms);
      member.push((await timed(() => withUserDb(memberClaims(embeddedart), (tx) => rankCompany(tx, embeddedart, "personal", { now: NOW })))).ms);
    }
    const line = (list: number[]) => list.map((ms) => ms.toFixed(0)).join(", ");
    console.log(`rankCompany personal, warm, 5 calls: service client ${line(service)} ms; member's own transaction ${line(member)} ms`);
    expect(Math.max(...service)).toBeLessThan(1000);
    expect(Math.max(...member)).toBeLessThan(1000);
  });

  it("stores a ranking without losing the judge's text, and leaves out a rejected match", async () => {
    const embeddedart = ids.embeddedart;
    const result = await rolledBack(asService, async (tx) => {
      const first = await rankCompany(tx, embeddedart, "public", { now: NOW });
      await storeRanking(tx, embeddedart, "public", first);
      const [judged, rejected] = [first[0].opportunityId, first[1].opportunityId];
      const mine = and(eq(matches.companyId, embeddedart), eq(matches.mode, "public"));
      await tx.update(matches).set({ why: "Kept by the judge.", judgedAt: NOW }).where(and(mine, eq(matches.opportunityId, judged)));
      await tx.update(matches).set({ rejected: true, rejectionReason: "Test." }).where(and(mine, eq(matches.opportunityId, rejected)));

      const second = await rankCompany(tx, embeddedart, "public", { now: NOW });
      const stored = await storeRanking(tx, embeddedart, "public", second);
      const rows = await tx.select().from(matches).where(mine);
      return { judged, rejected, second, stored, rows };
    });

    expect(result.second.map((r) => r.opportunityId)).not.toContain(result.rejected);
    expect(result.second).toHaveLength(TOP_N);
    expect(result.stored.ranked).toBe(TOP_N);
    const byOpportunity = new Map(result.rows.map((r) => [r.opportunityId, r]));
    expect(byOpportunity.get(result.judged)).toMatchObject({ rank: 1, why: "Kept by the judge.", judgedAt: NOW });
    expect(byOpportunity.get(result.rejected)).toMatchObject({ rank: null, rejected: true, rejectionReason: "Test." });
    const ranked = result.rows.filter((r) => r.rank !== null);
    expect(ranked.map((r) => r.opportunityId).sort()).toEqual(result.second.map((r) => r.opportunityId).sort());
    for (const row of ranked) {
      const match = result.second.find((r) => r.opportunityId === row.opportunityId)!;
      expect(row).toMatchObject({ rank: match.rank, score: match.score, scoreBreakdown: match.scoreBreakdown, matchedOn: match.matchedOn });
    }
  });

  it("ranks a member's own company through its own client, and nothing for another company", async () => {
    const [embeddedart, techinova] = [ids.embeddedart, ids.techinova];
    const own = await withUserDb(memberClaims(embeddedart), (tx) => rankCompany(tx, embeddedart, "personal", { now: NOW }));
    expect(own).toHaveLength(TOP_N);
    // Row-level security hides nothing the member's own ranking needs.
    expect(own).toEqual(await rankCompany(getDb(), embeddedart, "personal", { now: NOW }));

    // Techinova's private row is hidden from EmbeddedArt, so there is no personal ranking to build.
    const other = await withUserDb(memberClaims(embeddedart), (tx) => rankCompany(tx, techinova, "personal", { now: NOW }));
    expect(other).toEqual([]);
  });
});
