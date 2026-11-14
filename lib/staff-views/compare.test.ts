import { describe, expect, it } from "vitest";
import { markShared, parseSlugPair, topMatches, type PublicMatchRow } from "./compare";

function row(id: string, rank: number | null, overrides: Partial<PublicMatchRow> = {}): PublicMatchRow {
  return {
    opportunityId: id,
    externalId: `ext-${id}`,
    rank,
    rejected: false,
    why: `Why ${id}`,
    title: `Title ${id}`,
    kind: "funding",
    source: "Vinnova",
    url: `https://example.org/${id}`,
    simulated: false,
    ...overrides,
  };
}

describe("topMatches", () => {
  it("takes the five best kept matches by rank", () => {
    const top = topMatches([row("g", 7), row("a", 1), row("c", 3), row("b", 2), row("f", 6), row("d", 4)]);
    expect(top.map((t) => [t.position, t.rank, t.opportunityId])).toEqual([
      [1, 1, "a"],
      [2, 2, "b"],
      [3, 3, "c"],
      [4, 4, "d"],
      [5, 6, "f"],
    ]);
  });

  it("never shows a rejected row, a row without a rank or an old fixture", () => {
    const top = topMatches([
      row("rejected", 1, { rejected: true }),
      row("unranked", null),
      row("fixture", 2, { externalId: "fixture-vinnova-1" }),
      row("kept", 3),
    ]);
    expect(top.map((t) => t.opportunityId)).toEqual(["kept"]);
    expect(top[0].position).toBe(1);
  });

  it("gives null for a match that is not judged yet", () => {
    expect(topMatches([row("x", 1, { why: null }), row("y", 2, { why: "  " })]).map((t) => t.why)).toEqual([null, null]);
  });

  it("keeps what the data status label needs: simulated, the source's state and the copy's date (D20)", () => {
    const copy = new Date("2026-11-10T02:00:00Z");
    const [cached, hand, live] = topMatches([
      row("cached", 1, { sourceState: "cached", cachedAt: copy }),
      row("hand", 2, { simulated: true, sourceState: "simulated" }),
      row("live", 3),
    ]);
    expect(cached).toMatchObject({ sourceState: "cached", cachedAt: copy, simulated: false });
    expect(hand).toMatchObject({ sourceState: "simulated", simulated: true, externalId: "ext-hand" });
    expect(live).toMatchObject({ sourceState: null, cachedAt: null });
  });
});

describe("markShared", () => {
  it("marks the opportunities that are in both top fives", () => {
    const a = topMatches([row("x", 1), row("shared1", 2), row("y", 3), row("shared2", 4)]);
    const b = topMatches([row("shared2", 1), row("z", 2), row("shared1", 3)]);
    const result = markShared(a, b);
    expect(result.shared).toEqual(["shared1", "shared2"]);
    expect(result.a.map((t) => [t.opportunityId, t.inBoth])).toEqual([
      ["x", false],
      ["shared1", true],
      ["y", false],
      ["shared2", true],
    ]);
    expect(result.b.map((t) => [t.opportunityId, t.inBoth])).toEqual([
      ["shared2", true],
      ["z", false],
      ["shared1", true],
    ]);
  });

  it("marks nothing when the lists differ or one is empty", () => {
    expect(markShared(topMatches([row("x", 1)]), topMatches([row("y", 1)])).shared).toEqual([]);
    expect(markShared([], topMatches([row("y", 1)]))).toEqual({ a: [], b: [expect.objectContaining({ inBoth: false })], shared: [] });
  });
});

describe("parseSlugPair", () => {
  it("accepts two different member slugs", () => {
    expect(parseSlugPair("embeddedart", " Malvacom ")).toEqual({ ok: true, a: "embeddedart", b: "malvacom" });
  });

  it("refuses a missing, malformed or repeated slug", () => {
    expect(parseSlugPair("embeddedart", null)).toEqual({ ok: false, error: "Pick two members." });
    expect(parseSlugPair(undefined, "")).toEqual({ ok: false, error: "Pick two members." });
    expect(parseSlugPair("embeddedart", "drop table;")).toEqual({ ok: false, error: "That is not a member slug." });
    expect(parseSlugPair("saab", "SAAB")).toEqual({ ok: false, error: "Pick two different members." });
  });
});
