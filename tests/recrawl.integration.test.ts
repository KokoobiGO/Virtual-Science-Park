/**
 * The weekly re-crawl (A23) from a changed page to a "Suggested update",
 * against the real database.
 *
 * A throwaway member is profiled from its pages, the member corrects one
 * field, then its own page changes and the re-crawl runs. It calls the same
 * functions in the same order as the profile-company job with
 * `refresh: true` (lib/inngest/functions/profile-company.ts): fetchSnapshot,
 * runProfiler, verifyDraftClaims, mergeRetry, assessProfile, storeProfile.
 * Only the page download (fetchPage) and the model call (modelChat) are
 * stubbed: no request leaves the machine and no model is called.
 *
 * Every write happens inside a transaction that is rolled back, so the
 * database is left exactly as it was found. Skips itself when DATABASE_URL is
 * not set.
 */
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "../lib/db";
import { claims, companies, evidence, snapshots } from "../lib/db/schema";
import type { UserTx } from "../lib/db/user";
import type { ChatResponse } from "../lib/model";
import { claimsInCharge, profileView } from "../lib/profile-view/claims";
import { planEdit } from "../lib/profile-view/edit";
import { runProfiler } from "../lib/profiler";
import { assessProfile } from "../lib/profiler/assess";
import { storeProfile, type StoredProfile } from "../lib/profiler/store";
import { mergeRetry, verifyDraftClaims } from "../lib/profiler/verify";
import { ProfileField } from "../lib/schemas";
import { fetchSnapshot } from "../lib/snapshots";

const { fetchPage, modelChat } = vi.hoisted(() => ({ fetchPage: vi.fn(), modelChat: vi.fn() }));

vi.mock("../lib/fetcher/fetch-page", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/fetcher/fetch-page")>()),
  fetchPage: (url: string) => fetchPage(url),
}));
vi.mock("../lib/model", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/model")>()),
  modelChat: (...args: unknown[]) => modelChat(...args),
}));

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

// The member's pages. The company's own site changes between the two crawls; BSP's page about it does not.
const SUMMARY_OLD = "Testbolaget tillverkar undervattenssensorer för hamnar och farleder.";
const SUMMARY_NEW = "Testbolaget tillverkar undervattenssensorer och lidar för hamnar och farleder.";
const SONAR = "Vi bygger sonarer för hamnar.";
const LIDAR = "Från i år bygger vi även lidar för hamnar.";
const ML = "Vi använder maskininlärning i alla våra produkter.";
const SITE_OLD = [SUMMARY_OLD, SONAR, ML];
const SITE_NEW = [SUMMARY_NEW, SONAR, LIDAR, ML];
const MEMBER_PAGE = ["Testbolaget är medlem i Blue Science Park och arbetar med marin teknik i Karlskrona."];

const html = (paragraphs: string[]) =>
  `<!doctype html><html lang="sv"><head><title>Testbolaget</title></head><body><main>${paragraphs.map((p) => `<p>${p}</p>`).join("")}</main></body></html>`;

// The stubbed model answers, in the profiler's output schema (lib/profiler/output.ts). S1 is the company's site.
const missing = { status: "missing", evidence: [], values: [], confidence: 0 };
const stated = (values: string[], quotes: string[]) => ({ status: "stated", evidence: quotes.map((quote) => ({ source: "S1", quote })), values, confidence: 0.8 });
const answer = (fields: Partial<Record<ProfileField, unknown>>): ChatResponse => ({
  model: "stubbed-model",
  choices: [
    {
      finish_reason: "stop",
      message: { role: "assistant", content: JSON.stringify({ ...Object.fromEntries(ProfileField.options.map((f) => [f, missing])), ...fields }) },
    },
  ],
  usage: { prompt_tokens: 1000, completion_tokens: 200, total_tokens: 1200 },
});
const FIRST_ANSWER = answer({
  summary: stated(["Makes underwater sensors for harbours and fairways."], [SUMMARY_OLD]),
  offerings: stated(["Sonar"], [SONAR]),
  technologies: stated(["Machine learning"], [ML]),
});
const CHANGED_ANSWER = answer({
  // Changed, with a new quote: a suggestion, but the member has corrected this field.
  summary: stated(["Makes underwater sensors and lidar for harbours and fairways."], [SUMMARY_NEW]),
  // Changed, with a new quote: the one suggestion.
  offerings: stated(["Sonar", "Lidar"], [SONAR, LIDAR]),
  // Reworded, same quote: not a change.
  technologies: stated(["Machine learning (ML)"], [ML]),
});

const MEMBER_SUMMARY = "We build sensors for ports. (Our own words.)";

describe.skipIf(!configured)("weekly re-crawl: a changed page becomes a suggested update", () => {
  const id = randomUUID().slice(0, 8);
  const site = `https://test-recrawl-${id}.example/`;
  const memberPage = `https://test-recrawl-${id}.example/medlem`;
  let sitePage = SITE_OLD;

  beforeEach(() => {
    // Live fetching, whatever .env.local says: fetchPage is the stub below.
    vi.stubEnv("DEMO_MODE", "live");
    sitePage = SITE_OLD;
    fetchPage.mockReset();
    fetchPage.mockImplementation(async (url: string) => ({ url, status: 200, html: html(url === site ? sitePage : MEMBER_PAGE) }));
    modelChat.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());
  afterAll(closeDb);

  /** A throwaway company, profiled once from the old pages, with the member's own correction of the summary. */
  async function setUp(tx: UserTx) {
    const [company] = await tx
      .insert(companies)
      .values({ slug: `test-recrawl-${id}`, name: "Testbolaget AB", website: site, memberPage })
      .returning({ id: companies.id, name: companies.name });

    modelChat.mockResolvedValueOnce(FIRST_ANSWER);
    const first = await profileRun(tx, company, { refresh: false });
    expect(first).toMatchObject({ stored: { active: 8, suggested: 0, superseded: 0, evidence: 3 } });

    // What the profile editor's saveClaim (app/profile/actions.ts) writes for an edit.
    const before = await claimRows(tx, company.id);
    const shown = claimsInCharge(before).get("summary")!;
    const plan = planEdit("summary", shown, [shown.id], { value: MEMBER_SUMMARY, visibility: "public" });
    if (plan.kind !== "save") throw new Error("The edit should save.");
    expect(plan.claim.status).toBe("user_corrected");
    await tx.update(claims).set({ reviewState: "superseded" }).where(inArray(claims.id, plan.supersede));
    const [corrected] = await tx.insert(claims).values({ companyId: company.id, ...plan.claim }).returning();
    return { company, corrected };
  }

  /**
   * One run of the profile-company job's body, minus Inngest's steps: fetch both pages, stop when neither
   * changed (refresh only), else ask the profiler, check the quotes and store.
   */
  async function profileRun(
    tx: UserTx,
    company: { id: string; name: string },
    { refresh }: { refresh: boolean },
  ): Promise<{ skipped: "unchanged" } | { stored: StoredProfile; snapshotIds: string[] }> {
    const pages = [
      { url: site, source: "company_site" },
      { url: memberPage, source: "bsp_member" },
    ];
    const fetched = [];
    for (const page of pages) fetched.push(await fetchSnapshot({ ...page, companyId: company.id }, { db: tx }));
    if (refresh && fetched.every((f) => f.unchanged)) return { skipped: "unchanged" };

    const sources = fetched.map(({ snapshot: s }) => ({ snapshotId: s.id, source: s.source, url: s.url, lang: s.lang, text: s.contentText }));
    const run = await runProfiler(company.name, sources);
    const first = verifyDraftClaims(run.claims, new Map(sources.map((s) => [s.snapshotId, s.text])));
    // Every stubbed quote is on its page, so the job would not retry either.
    expect(first.failed).toEqual([]);
    const { claims: checked } = mergeRetry(first, null);
    const assessment = assessProfile(checked, { fetched: pages, failed: [] });
    const stored = await storeProfile(company.id, checked, assessment, { refresh, db: tx });
    return { stored, snapshotIds: fetched.map((f) => f.snapshot.id) };
  }

  const claimRows = (tx: UserTx, companyId: string) => tx.select().from(claims).where(eq(claims.companyId, companyId));

  it("stores the changed field as a suggestion, keeps what the member sees, and never touches the member's correction", async () => {
    await rolledBack(async (tx) => {
      const { company, corrected } = await setUp(tx);
      const [{ profileStatus, profileNote }] = await tx.select().from(companies).where(eq(companies.id, company.id));
      const before = await claimRows(tx, company.id);
      const shownOfferings = claimsInCharge(before).get("offerings")!;
      expect(shownOfferings.value).toEqual(["Sonar"]);

      // The Monday re-crawl with the pages as they were: one fetch per page, no model call, nothing stored.
      expect(await profileRun(tx, company, { refresh: true })).toEqual({ skipped: "unchanged" });
      expect(modelChat).toHaveBeenCalledTimes(1);
      expect(await claimRows(tx, company.id)).toHaveLength(before.length);

      // The company's own site changes; the next re-crawl reads the new text.
      sitePage = SITE_NEW;
      modelChat.mockResolvedValueOnce(CHANGED_ANSWER);
      const run = await profileRun(tx, company, { refresh: true });
      if (!("stored" in run)) throw new Error("The changed page should have been profiled.");
      expect(modelChat).toHaveBeenCalledTimes(2);
      expect(JSON.stringify(modelChat.mock.calls[1][0])).toContain(LIDAR);
      expect(run.stored).toEqual({ active: 0, suggested: 1, superseded: 0, evidence: 2 });

      const after = await claimRows(tx, company.id);
      expect(after).toHaveLength(before.length + 1);
      // Nothing that was there moved: no claim was overwritten, superseded or deleted.
      const state = (rows: typeof before) =>
        rows
          .map((c) => [c.id, c.reviewState, c.value])
          .sort(([a], [b]) => String(a).localeCompare(String(b)));
      expect(state(after.filter((c) => before.some((b) => b.id === c.id)))).toEqual(state(before));

      // The difference is stored as a "Suggested update" next to the claim the member sees.
      const suggestion = after.find((c) => c.reviewState === "suggested")!;
      expect(suggestion).toMatchObject({ field: "offerings", value: ["Sonar", "Lidar"], updatedBy: "profiler", supersedesId: shownOfferings.id });
      const quotes = await tx.select().from(evidence).where(eq(evidence.claimId, suggestion.id));
      expect(quotes.map((q) => q.quote).sort()).toEqual([LIDAR, SONAR].sort());
      // Its quotes point at the new snapshot of the site, not the old one.
      const [newSite] = await tx.select().from(snapshots).where(eq(snapshots.id, run.snapshotIds[0]));
      expect(newSite.contentText).toContain(LIDAR);
      expect(quotes.every((q) => q.snapshotId === newSite.id)).toBe(true);

      // The member's correction is still in charge, and the changed summary did not become a suggestion over it.
      expect(after.find((c) => c.id === corrected.id)).toMatchObject({ reviewState: "active", status: "user_corrected", value: MEMBER_SUMMARY });
      expect(after.filter((c) => c.field === "summary" && c.reviewState !== "superseded").map((c) => c.id)).toEqual([corrected.id]);

      // What the profile screen shows the member (lib/profile-view/claims.ts).
      const view = profileView(after);
      const field = (name: ProfileField) => view.find((v) => v.field === name)!;
      expect(field("offerings").claim?.id).toBe(shownOfferings.id);
      expect(field("offerings").suggestion?.id).toBe(suggestion.id);
      expect(field("summary").claim?.id).toBe(corrected.id);
      expect(field("summary").suggestion).toBeNull();
      expect(field("technologies").suggestion).toBeNull();

      // A refresh leaves the company's status and note alone.
      const [now] = await tx.select().from(companies).where(eq(companies.id, company.id));
      expect([now.profileStatus, now.profileNote]).toEqual([profileStatus, profileNote]);
    });
  });

  it("keeps the member's correction in charge also when the whole profile is made again", async () => {
    await rolledBack(async (tx) => {
      const { company, corrected } = await setUp(tx);
      sitePage = SITE_NEW;
      modelChat.mockResolvedValueOnce(CHANGED_ANSWER);
      const run = await profileRun(tx, company, { refresh: false });
      if (!("stored" in run)) throw new Error("A full run always profiles.");

      const after = await claimRows(tx, company.id);
      expect(after.find((c) => c.id === corrected.id)).toMatchObject({ reviewState: "active", status: "user_corrected", value: MEMBER_SUMMARY });
      expect(claimsInCharge(after).get("summary")?.id).toBe(corrected.id);
      // The profiler's new summary waits for the member as a suggestion instead.
      const summaries = after.filter((c) => c.field === "summary" && c.reviewState === "suggested");
      expect(summaries).toHaveLength(1);
      expect(summaries[0]).toMatchObject({ updatedBy: "profiler", value: "Makes underwater sensors and lidar for harbours and fairways." });
      // No claim the member wrote was superseded.
      const userRows = await tx
        .select({ reviewState: claims.reviewState })
        .from(claims)
        .where(and(eq(claims.companyId, company.id), eq(claims.updatedBy, "user")));
      expect(userRows.map((r) => r.reviewState)).toEqual(["active"]);
    });
  });
});
