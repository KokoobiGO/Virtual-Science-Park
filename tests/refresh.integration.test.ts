/**
 * Refresh mode of storeProfile() (A23), against a real database.
 *
 * Creates one throwaway company (slug "test-refresh-...") with one snapshot,
 * stores a first profile, then two re-crawls, and deletes the company and the
 * snapshot again at the end, also when a test fails. Skips itself when
 * DATABASE_URL is not set.
 */
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../lib/db";
import { claims, companies, companyPrivate, EMBEDDING_DIMENSIONS, evidence, snapshots } from "../lib/db/schema";
import type { ProfileAssessment } from "../lib/profiler/assess";
import type { DraftClaim } from "../lib/profiler/output";
import { storeProfile } from "../lib/profiler/store";

const configured = Boolean(process.env.DATABASE_URL);

const slug = `test-refresh-${randomUUID().slice(0, 8)}`;
const url = `https://${slug}.example/`;
const TEXT = [
  "Vi tillverkar undervattenssensorer för hamnar.",
  "Vi bygger sonarer.",
  "Nu även lidar för hamnar.",
  "Från i år bygger vi även radar.",
  "Vi använder maskininlärning.",
].join(" ");

const PROFILED: ProfileAssessment = { status: "profiled", note: null };
const THIN: ProfileAssessment = { status: "thin", note: "Too little public info." };
const vector = () => Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.01);

describe.skipIf(!configured)("storeProfile in refresh mode", () => {
  let companyId: string | undefined;
  let snapshotId: string | undefined;

  const claim = (field: DraftClaim["field"], value: DraftClaim["value"], quotes: string[]): DraftClaim => ({
    field,
    value,
    status: value === null ? "missing" : "stated",
    confidence: value === null ? 0 : 0.8,
    evidence: quotes.map((quote) => ({ snapshotId: snapshotId!, url, quote, quoteLang: "sv" })),
  });

  const rows = () => getDb().select().from(claims).where(eq(claims.companyId, companyId!)).orderBy(claims.createdAt, claims.id);
  const company = async () => (await getDb().select().from(companies).where(eq(companies.id, companyId!)))[0];

  beforeAll(async () => {
    const db = getDb();
    const [created] = await db
      .insert(companies)
      .values({ slug, name: "Refresh Test AB", website: url, memberPage: `${url}member`, publicEmbedding: vector() })
      .returning({ id: companies.id });
    companyId = created.id;
    await db.insert(companyPrivate).values({ companyId, personalEmbedding: vector() });
    const [snapshot] = await db
      .insert(snapshots)
      .values({ companyId, source: "company_site", url, contentText: TEXT, contentHash: randomUUID(), lang: "sv", httpStatus: 200 })
      .returning({ id: snapshots.id });
    snapshotId = snapshot.id;
  });

  afterAll(async () => {
    const db = getDb();
    // The company first: its claims and their evidence go with it, and then nothing points at the snapshot.
    await db.delete(companies).where(eq(companies.slug, slug));
    if (snapshotId) await db.delete(snapshots).where(eq(snapshots.id, snapshotId));
    await closeDb();
  });

  it("stores a first profile as active claims and clears the embeddings", async () => {
    const stored = await storeProfile(
      companyId!,
      [
        claim("summary", "Makes underwater sensors for harbours.", ["Vi tillverkar undervattenssensorer för hamnar."]),
        claim("offerings", ["Sonar"], ["Vi bygger sonarer."]),
        claim("technologies", ["Machine learning"], ["Vi använder maskininlärning."]),
      ],
      PROFILED,
    );
    expect(stored).toEqual({ active: 3, suggested: 0, superseded: 0, evidence: 3 });
    expect((await rows()).every((c) => c.reviewState === "active")).toBe(true);

    const after = await company();
    expect(after.publicEmbedding).toBeNull();
    expect(after.profileStatus).toBe("profiled");
    const [settings] = await getDb().select().from(companyPrivate).where(eq(companyPrivate.companyId, companyId!));
    expect(settings.personalEmbedding).toBeNull();
  });

  it("stores exactly one suggestion for the one field that changed", async () => {
    const before = await rows();
    const oldOfferings = before.find((c) => c.field === "offerings")!;
    const profiledAt = (await company()).lastProfiledAt!;

    const stored = await storeProfile(
      companyId!,
      [
        // Reworded, same quote: not a change.
        claim("summary", "Builds sensors for use under water in harbours.", ["Vi tillverkar undervattenssensorer för hamnar."]),
        // New value with a new quote: a change.
        claim("offerings", ["Sonar", "Lidar"], ["Vi bygger sonarer.", "Nu även lidar för hamnar."]),
        // A value that went missing: not a change.
        claim("technologies", null, []),
      ],
      THIN,
      { refresh: true },
    );
    expect(stored).toEqual({ active: 0, suggested: 1, superseded: 0, evidence: 2 });

    const after = await rows();
    expect(after).toHaveLength(before.length + 1);
    const suggestion = after.find((c) => c.reviewState === "suggested")!;
    expect(suggestion).toMatchObject({ field: "offerings", value: ["Sonar", "Lidar"], updatedBy: "profiler", supersedesId: oldOfferings.id });
    expect(after.find((c) => c.id === oldOfferings.id)!.reviewState).toBe("active");
    // Nothing else moved.
    expect(after.filter((c) => c.id !== suggestion.id).map((c) => [c.id, c.reviewState])).toEqual(before.map((c) => [c.id, c.reviewState]));

    const quotes = await getDb().select().from(evidence).where(eq(evidence.claimId, suggestion.id));
    expect(quotes.map((q) => q.quote).sort()).toEqual(["Nu även lidar för hamnar.", "Vi bygger sonarer."]);
    expect(quotes.every((q) => q.snapshotId === snapshotId)).toBe(true);

    // Status and note stay; the profiling date moves.
    const now = await company();
    expect(now.profileStatus).toBe("profiled");
    expect(now.profileNote).toBeNull();
    expect(now.lastProfiledAt!.getTime()).toBeGreaterThanOrEqual(profiledAt.getTime());
  });

  it("stores nothing when the same change is found again", async () => {
    const before = await rows();
    const stored = await storeProfile(
      companyId!,
      [claim("offerings", ["Lidar", "Sonar"], ["Nu även lidar för hamnar."])],
      PROFILED,
      { refresh: true },
    );
    expect(stored).toEqual({ active: 0, suggested: 0, superseded: 0, evidence: 0 });
    expect(await rows()).toHaveLength(before.length);
  });

  it("supersedes the open suggestion when a second change comes", async () => {
    const before = await rows();
    const first = before.find((c) => c.reviewState === "suggested")!;
    const active = before.find((c) => c.field === "offerings" && c.reviewState === "active")!;

    const stored = await storeProfile(
      companyId!,
      [claim("offerings", ["Sonar", "Radar"], ["Från i år bygger vi även radar."])],
      PROFILED,
      { refresh: true },
    );
    expect(stored).toEqual({ active: 0, suggested: 1, superseded: 1, evidence: 1 });

    const after = await rows();
    expect(after).toHaveLength(before.length + 1);
    expect(after.find((c) => c.id === first.id)!.reviewState).toBe("superseded");
    expect(after.find((c) => c.id === active.id)!.reviewState).toBe("active");
    const open = after.filter((c) => c.field === "offerings" && c.reviewState === "suggested");
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ value: ["Sonar", "Radar"], supersedesId: active.id });
  });

  it("has stored five claims and six quotes in all, nothing more", async () => {
    const ids = (await rows()).map((c) => c.id);
    const quotes = await getDb()
      .select({ id: evidence.id })
      .from(evidence)
      .where(and(inArray(evidence.claimId, ids), eq(evidence.snapshotId, snapshotId!)));
    expect(ids).toHaveLength(3 + 1 + 1);
    expect(quotes).toHaveLength(3 + 2 + 1);
  });
});
