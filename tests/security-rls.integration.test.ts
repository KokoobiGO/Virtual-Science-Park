/**
 * Row-level security holes and guards from the security review
 * (docs/security-review.md, findings F1, F2 and F6).
 *
 * Same pattern as tests/privacy-member.integration.test.ts: every test runs in
 * a transaction as the table owner that is always rolled back, switches to the
 * role a request would have (`authenticated` with JWT claims, as
 * lib/db/user.ts does, or `anon`), and tries the read or write. Each attempt
 * runs in its own savepoint, so a refused write does not end the transaction.
 * Nothing is left behind.
 *
 * `it.fails` marks a hole that is open today: the test states the property we
 * want and fails, so Vitest reports it as passing. When the fix lands the
 * property holds, the test passes, `it.fails` turns red, and it must become a
 * plain `it`. Plain `it` tests are guards that hold today.
 *
 * The same writes are possible from a browser: the `authenticated` role has
 * INSERT and UPDATE on these tables, and the member's access token sits in a
 * cookie the page's JavaScript can read, so Supabase's REST API
 * (`/rest/v1/claims`) accepts them with the publishable key.
 *
 * Needs DATABASE_URL and the gold members; skips itself otherwise.
 */
import { randomUUID } from "node:crypto";
import { count, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../lib/db";
import { claims, companies, evalRuns, evidence, jobRuns, matches, opportunities, snapshots, weekCards } from "../lib/db/schema";
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

/** From here on in this transaction, act as a request with these JWT claims and this database role. */
async function actAs(tx: UserTx, claimsJson: Record<string, unknown>, role: "authenticated" | "anon" = "authenticated") {
  await tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify(claimsJson)}, true)`);
  if (role === "anon") await tx.execute(sql`set local role anon`);
  else await tx.execute(sql`set local role authenticated`);
}

const memberClaims = (companyId: string, userId = randomUUID()) => ({
  sub: userId,
  role: "authenticated",
  app_metadata: { role: "member", company_id: companyId },
});

type Attempt<T> = { ok: true; value: T } | { ok: false; error: string };

/** One statement in its own savepoint: a refusal rolls back only the savepoint. */
async function attempt<T>(tx: UserTx, run: (sp: UserTx) => Promise<T>): Promise<Attempt<T>> {
  try {
    return { ok: true, value: await tx.transaction((sp) => run(sp)) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** True when the write was refused, or went through but changed no row. */
const refused = (result: Attempt<unknown[]>) => !result.ok || result.value.length === 0;

const PROBE = "Security review probe (rolled back)";

describe.skipIf(!configured)("security review: row-level security", () => {
  let embeddedart: string;
  let techinova: string;
  let opportunityId: string;

  beforeAll(async () => {
    const rows = await getDb()
      .select({ id: companies.id, slug: companies.slug })
      .from(companies)
      .where(inArray(companies.slug, ["embeddedart", "techinova"]));
    embeddedart = rows.find((r) => r.slug === "embeddedart")?.id ?? "";
    techinova = rows.find((r) => r.slug === "techinova")?.id ?? "";
    const [opportunity] = await getDb().select({ id: opportunities.id }).from(opportunities).limit(1);
    opportunityId = opportunity?.id ?? "";
    expect(embeddedart && techinova && opportunityId, "needs the embeddedart and techinova members and one opportunity").toBeTruthy();
  });

  afterAll(closeDb);

  /** An active profiler claim of `companyId` with one piece of evidence, written as the owner inside the rolled-back transaction. */
  async function plantProfilerClaim(tx: UserTx, companyId: string): Promise<string> {
    const [snapshot] = await tx
      .insert(snapshots)
      .values({ companyId, source: "security_probe", url: "https://example.org/probe", contentText: `${PROBE}: we build sensors.`, contentHash: randomUUID() })
      .returning({ id: snapshots.id });
    const [claim] = await tx
      .insert(claims)
      .values({ companyId, field: "summary", value: "We build sensors.", status: "stated", confidence: 0.9, updatedBy: "profiler", visibility: "public" })
      .returning({ id: claims.id });
    await tx.insert(evidence).values({
      claimId: claim.id,
      snapshotId: snapshot.id,
      url: "https://example.org/probe",
      quote: "we build sensors",
      quoteLang: "en",
      retrievedAt: new Date(),
    });
    return claim.id;
  }

  describe("F1: a member can forge where a profile claim came from", () => {
    it.fails("refuses a member's own claim marked 'stated', the badge for a value quoted from a web page [open: accepted today]", async () => {
      let result: Attempt<unknown[]> | undefined;
      await rolledBack(async (tx) => {
        await actAs(tx, memberClaims(embeddedart));
        result = await attempt(tx, (sp) =>
          sp
            .insert(claims)
            .values({ companyId: embeddedart, field: "summary", value: PROBE, status: "stated", confidence: 0.9, updatedBy: "user", visibility: "public" })
            .returning({ id: claims.id }),
        );
      });
      expect(refused(result!)).toBe(true);
    });

    it.fails("refuses a member's change to the value of a profiler claim, which keeps its page quotes [open: accepted today]", async () => {
      let result: Attempt<unknown[]> | undefined;
      await rolledBack(async (tx) => {
        const claimId = await plantProfilerClaim(tx, embeddedart);
        await actAs(tx, memberClaims(embeddedart));
        result = await attempt(tx, (sp) =>
          sp.update(claims).set({ value: `${PROBE}: a value the page never says` }).where(eq(claims.id, claimId)).returning({ id: claims.id }),
        );
      });
      expect(refused(result!)).toBe(true);
    });

    it.fails("refuses a member relabelling its own correction as written by the profiler [open: accepted today]", async () => {
      let result: Attempt<unknown[]> | undefined;
      await rolledBack(async (tx) => {
        await actAs(tx, memberClaims(embeddedart));
        const [own] = await tx
          .insert(claims)
          .values({ companyId: embeddedart, field: "markets", value: [PROBE], status: "user_corrected", confidence: 1, updatedBy: "user", visibility: "public" })
          .returning({ id: claims.id });
        result = await attempt(tx, (sp) =>
          sp.update(claims).set({ updatedBy: "profiler", status: "stated", confidence: 0.8 }).where(eq(claims.id, own.id)).returning({ id: claims.id }),
        );
      });
      expect(refused(result!)).toBe(true);
    });
  });

  describe("guards that hold today", () => {
    it("a member's normal correction is still allowed (the editor's own write)", async () => {
      let result: Attempt<unknown[]> | undefined;
      await rolledBack(async (tx) => {
        await actAs(tx, memberClaims(embeddedart));
        result = await attempt(tx, (sp) =>
          sp
            .insert(claims)
            .values({ companyId: embeddedart, field: "summary", value: PROBE, status: "user_corrected", confidence: 1, updatedBy: "user", visibility: "private" })
            .returning({ id: claims.id }),
        );
      });
      expect(result!.ok).toBe(true);
    });

    it("refuses moving a claim to another company", async () => {
      let result: Attempt<unknown[]> | undefined;
      await rolledBack(async (tx) => {
        const claimId = await plantProfilerClaim(tx, embeddedart);
        await actAs(tx, memberClaims(embeddedart));
        result = await attempt(tx, (sp) => sp.update(claims).set({ companyId: techinova }).where(eq(claims.id, claimId)).returning({ id: claims.id }));
      });
      expect(refused(result!)).toBe(true);
    });

    it("changes no claim of another company", async () => {
      let result: Attempt<unknown[]> | undefined;
      await rolledBack(async (tx) => {
        const theirs = await plantProfilerClaim(tx, techinova);
        await actAs(tx, memberClaims(embeddedart));
        result = await attempt(tx, (sp) => sp.update(claims).set({ value: PROBE }).where(eq(claims.id, theirs)).returning({ id: claims.id }));
      });
      expect(refused(result!)).toBe(true);
    });

    it("refuses evidence, matches, week cards, company rows and job runs written by a member", async () => {
      const results: Record<string, Attempt<unknown[]>> = {};
      await rolledBack(async (tx) => {
        const own = await plantProfilerClaim(tx, embeddedart);
        const [snapshot] = await tx.select({ id: snapshots.id }).from(snapshots).where(eq(snapshots.source, "security_probe")).limit(1);
        await actAs(tx, memberClaims(embeddedart));
        results.evidence = await attempt(tx, (sp) =>
          sp
            .insert(evidence)
            .values({ claimId: own, snapshotId: snapshot.id, url: "https://example.org/probe", quote: PROBE, quoteLang: "en", retrievedAt: new Date() })
            .returning({ id: evidence.id }),
        );
        results.matches = await attempt(tx, (sp) =>
          sp
            .insert(matches)
            .values({
              companyId: embeddedart,
              opportunityId,
              mode: "public",
              score: 1,
              scoreBreakdown: { similarity: 1, tagOverlap: 1, priorityBoost: 0, urgency: 0, feedback: 0 },
              rank: 1,
              why: PROBE,
            })
            .returning({ id: matches.id }),
        );
        results.weekCards = await attempt(tx, (sp) =>
          sp
            .insert(weekCards)
            .values({ companyId: embeddedart, weekOf: "2026-11-16", position: 99, title: PROBE, why: PROBE, nextStep: PROBE })
            .returning({ id: weekCards.id }),
        );
        results.companies = await attempt(tx, (sp) => sp.update(companies).set({ name: PROBE }).where(eq(companies.id, embeddedart)).returning({ id: companies.id }));
        results.jobRuns = await attempt(tx, (sp) => sp.insert(jobRuns).values({ job: "security_probe" }).returning({ id: jobRuns.id }));
      });
      for (const [table, result] of Object.entries(results)) expect(refused(result), table).toBe(true);
    });
  });

  describe("F2 and F6: reads beyond the privacy model", () => {
    it.fails("a signed-out visitor (anon, the public key alone) reads no eval results [open: anon reads eval_runs, red-team answers included]", async () => {
      let seen = -1;
      await rolledBack(async (tx) => {
        await tx.insert(evalRuns).values({ kind: "security_probe", summary: {}, details: { answer: `${PROBE}: a member's personal matches` } });
        await actAs(tx, { role: "anon" }, "anon");
        [{ n: seen }] = await tx.select({ n: count() }).from(evalRuns).where(eq(evalRuns.kind, "security_probe"));
      });
      expect(seen).toBe(0);
    });

    it.fails("an account with no role in app_metadata (a self sign-up) reads no company data [open: it reads every public claim, snapshot and opportunity]", async () => {
      let seen: { companies: number; claims: number; snapshots: number; opportunities: number } | undefined;
      await rolledBack(async (tx) => {
        await actAs(tx, { sub: randomUUID(), role: "authenticated" });
        const [row] = await tx.execute<{ companies: number; claims: number; snapshots: number; opportunities: number }>(sql`
          select (select count(*)::int from companies) as companies,
                 (select count(*)::int from claims) as claims,
                 (select count(*)::int from snapshots) as snapshots,
                 (select count(*)::int from opportunities) as opportunities
        `);
        seen = row;
      });
      expect(seen).toEqual({ companies: 0, claims: 0, snapshots: 0, opportunities: 0 });
    });

    it("a signed-out visitor still reads no companies, claims or matches", async () => {
      let seen: { companies: number; claims: number; matches: number } | undefined;
      await rolledBack(async (tx) => {
        await actAs(tx, { role: "anon" }, "anon");
        const [row] = await tx.execute<{ companies: number; claims: number; matches: number }>(sql`
          select (select count(*)::int from companies) as companies,
                 (select count(*)::int from claims) as claims,
                 (select count(*)::int from matches) as matches
        `);
        seen = row;
      });
      expect(seen).toEqual({ companies: 0, claims: 0, matches: 0 });
    });
  });
});
