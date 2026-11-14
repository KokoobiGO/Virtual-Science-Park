import { describe, expect, it } from "vitest";
import { idsWithoutStatus, withCitationStatus, type CitationStatus } from "./citations";
import type { ScoutOption } from "./types";

function option(n: number, citation: Partial<ScoutOption["citation"]> = {}, opportunityId: string | null = `opp-${n}`): ScoutOption {
  return {
    title: `Option ${n}`,
    kind: "testbed",
    whyProfile: "w",
    whySource: "w",
    requirements: [],
    contactRoute: "c",
    openQuestions: [],
    citation: { url: `https://example.se/${n}`, title: `Source ${n}`, retrievedAt: "2026-11-14", origin: "store", sourceName: "S", pageRead: false, ...citation },
    opportunityId,
    deadline: null,
  };
}

describe("citation status for briefs stored before D20", () => {
  const old = option(1);
  const recorded = option(2, { simulated: false, sourceState: "live", sourceCachedAt: null });
  const web = option(3, { origin: "web" }, null);
  const brief = { options: [old, recorded, web, option(4)] };

  it("finds the store citations without a status", () => {
    expect(idsWithoutStatus(brief)).toEqual(["opp-1", "opp-4"]);
  });

  it("fills them in from the store row and leaves recorded ones alone", () => {
    const byId = new Map<string, CitationStatus>([
      ["opp-1", { simulated: true, sourceState: "simulated", sourceCachedAt: null }],
      ["opp-2", { simulated: true, sourceState: "cached", sourceCachedAt: "2026-11-10T02:00:00.000Z" }],
    ]);
    const filled = withCitationStatus(brief, byId);
    expect(filled.options[0].citation).toMatchObject({ simulated: true, sourceState: "simulated", url: "https://example.se/1" });
    // Recorded at run time: kept as it was.
    expect(filled.options[1].citation).toEqual(recorded.citation);
    expect(filled.options[2]).toBe(web);
    // Not found in the store (deleted since): still no status, so no label.
    expect(filled.options[3].citation.simulated).toBeUndefined();
  });
});
