import { describe, expect, it } from "vitest";
import { loadFixtures } from ".";

describe("fixtures", () => {
  const fixtures = loadFixtures();

  it("hold the three gold members", () => {
    expect(fixtures.companies.map((c) => c.slug).sort()).toEqual(["embeddedart", "malvacom", "techinova"]);
  });

  it("hold about 15 opportunities of every kind", () => {
    expect(fixtures.opportunities.length).toBeGreaterThanOrEqual(15);
    const kinds = new Set(fixtures.opportunities.map((o) => o.kind));
    expect([...kinds].sort()).toEqual(["event", "funding", "news", "testbed"]);
  });

  it("give each gold member a different top match", () => {
    const top = new Map<string, { id: string; score: number }>();
    for (const m of fixtures.matches) {
      const b = m.breakdown;
      const score = 0.45 * b.similarity + 0.2 * b.tagOverlap + 0.15 * b.priorityBoost + 0.1 * b.urgency;
      if ((top.get(m.company)?.score ?? -1) < score) top.set(m.company, { id: m.opportunity, score });
    }
    expect(new Set([...top.values()].map((t) => t.id)).size).toBe(3);
  });

  it("include at least one private claim for the privacy tests", () => {
    const privateClaims = fixtures.companies.flatMap((c) => c.claims.filter((claim) => claim.visibility === "private"));
    expect(privateClaims.length).toBeGreaterThan(0);
  });

  it("keep EmbeddedArt's quotes in Swedish", () => {
    const embeddedart = fixtures.companies.find((c) => c.slug === "embeddedart")!;
    expect(embeddedart.snapshots.every((s) => s.lang === "sv")).toBe(true);
  });
});
