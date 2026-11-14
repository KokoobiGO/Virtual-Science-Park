import { describe, expect, it } from "vitest";
import type { OpportunityKind } from "../schemas";
import { buildCards, CARD_RULES, pickMatches, pickTrendNote, TREND_NEXT_STEP, type CardCandidate, type TrendNoteForCard } from "./select";

let n = 0;
function match(kind: OpportunityKind, source: string, overrides: Partial<CardCandidate> = {}): CardCandidate {
  n++;
  return {
    matchId: `m${n}`,
    opportunityId: `o${n}`,
    rank: n,
    judged: true,
    rejected: false,
    kind,
    source,
    title: `Opportunity ${n}`,
    url: `https://example.org/${n}`,
    why: `Why ${n}.`,
    nextStep: `Next step ${n}.`,
    uncertainties: [`Open question ${n}`],
    ...overrides,
  };
}

/** Candidates in rank order 1, 2, 3, ... */
function ranked(...specs: [OpportunityKind, string][]): CardCandidate[] {
  n = 0;
  return specs.map(([kind, source]) => match(kind, source));
}

const ranks = (cards: { rank: number | null }[]) => cards.map((c) => c.rank);

describe("pickMatches", () => {
  it("takes up to 6 in rank order", () => {
    const picked = pickMatches(
      ranked(["funding", "A"], ["testbed", "B"], ["event", "C"], ["funding", "D"], ["testbed", "E"], ["event", "F"], ["funding", "G"], ["testbed", "H"]),
    );
    expect(ranks(picked)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(CARD_RULES.max).toBe(6);
  });

  it("takes at most 3 of one kind", () => {
    const picked = pickMatches(
      ranked(["funding", "A"], ["funding", "B"], ["funding", "C"], ["funding", "D"], ["testbed", "E"], ["event", "F"], ["testbed", "G"], ["event", "H"]),
    );
    expect(ranks(picked)).toEqual([1, 2, 3, 5, 6, 7]);
  });

  it("takes at most 2 from one source", () => {
    const picked = pickMatches(
      ranked(["funding", "EU"], ["testbed", "EU"], ["event", "EU"], ["funding", "Vinnova"], ["testbed", "Curated"], ["event", "BSP"], ["event", "TCL"]),
    );
    expect(ranks(picked)).toEqual([1, 2, 4, 5, 6, 7]);
  });

  it("skips news, rejected, unjudged, unranked and textless rows", () => {
    n = 0;
    const candidates = [
      match("news", "BSP news"),
      match("funding", "A", { rejected: true }),
      match("funding", "B", { judged: false }),
      match("funding", "C", { rank: null }),
      match("funding", "D", { why: null }),
      match("funding", "E"),
    ];
    expect(pickMatches(candidates).map((c) => c.source)).toEqual(["E"]);
  });

  it("sorts by rank whatever order the rows come in", () => {
    const picked = pickMatches(ranked(["funding", "A"], ["testbed", "B"], ["event", "C"]).reverse());
    expect(ranks(picked)).toEqual([1, 2, 3]);
  });

  it("relaxes the source rule first when fewer than 5 pass", () => {
    // Strict: EU, EU (source cap), Curated, Curated (source cap) = 4 cards. Relaxed source: the next EU funding row fills to 5.
    const picked = pickMatches(
      ranked(["funding", "EU"], ["funding", "EU"], ["funding", "EU"], ["testbed", "Curated"], ["testbed", "Curated"], ["testbed", "Curated"]),
    );
    expect(ranks(picked)).toEqual([1, 2, 3, 4, 5]);
    expect(picked.filter((c) => c.source === "EU")).toHaveLength(3);
  });

  it("relaxes the kind rule only after the source rule", () => {
    // Only funding: 3 by the kind rule, even with the source rule relaxed; then the kind rule goes and two more fill to 5.
    const picked = pickMatches(ranked(["funding", "EU"], ["funding", "EU"], ["funding", "EU"], ["funding", "EU"], ["funding", "EU"], ["funding", "EU"], ["funding", "EU"]));
    expect(ranks(picked)).toEqual([1, 2, 3, 4, 5]);
  });

  it("keeps the kind rule when relaxing the source rule is enough", () => {
    const picked = pickMatches(
      ranked(["funding", "EU"], ["funding", "EU"], ["funding", "EU"], ["funding", "EU"], ["testbed", "Curated"], ["testbed", "Curated"], ["testbed", "Curated"]),
    );
    // Strict: 1, 2 (EU cap), 5, 6 (Curated cap) = 4. Source relaxed, kind kept: rank 3 (third funding) makes 5; rank 4 would be a fourth funding.
    expect(ranks(picked)).toEqual([1, 2, 3, 5, 6]);
  });

  it("returns what there is when the matches run out", () => {
    expect(ranks(pickMatches(ranked(["funding", "EU"], ["funding", "EU"], ["funding", "EU"], ["funding", "EU"])))).toEqual([1, 2, 3, 4]);
    expect(pickMatches([])).toEqual([]);
  });
});

describe("pickTrendNote and the trend card", () => {
  const note = (area: string, title: string, weekOf = "2026-11-09"): TrendNoteForCard => ({
    id: `t-${area}-${title}`,
    area,
    weekOf,
    title,
    body: `What changed in ${area}.`,
    sources: [{ url: `https://example.org/${area}`, title: `${area} source` }],
  });

  it("picks this week's note for one of the company's tags, the company's first tag first", () => {
    const notes = [note("energy", "Grid"), note("sensor", "Sensors"), note("marine", "Old", "2026-11-02")];
    expect(pickTrendNote(notes, { weekOf: "2026-11-09", companyTags: ["marine", "sensor", "energy"] })?.title).toBe("Sensors");
    expect(pickTrendNote(notes, { weekOf: "2026-11-09", companyTags: ["ai"] })).toBeNull();
  });

  it("adds one trend card at the last position", () => {
    const matches = ranked(["funding", "A"], ["testbed", "B"], ["event", "C"], ["funding", "D"], ["testbed", "E"], ["event", "F"]);
    const cards = buildCards(matches, { trendNotes: [note("marine", "Sea"), note("sensor", "Sensors")], weekOf: "2026-11-09", companyTags: ["marine", "sensor"] });
    expect(cards).toHaveLength(7);
    expect(cards.map((c) => c.position)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(cards.filter((c) => c.kind === "trend")).toHaveLength(1);
    expect(cards[6]).toEqual({
      position: 7,
      kind: "trend",
      opportunityId: null,
      trendNoteId: "t-marine-Sea",
      title: "Sea",
      why: "What changed in marine.",
      nextStep: TREND_NEXT_STEP,
      uncertainties: [],
      sources: [{ url: "https://example.org/marine", title: "marine source" }],
    });
  });

  it("builds match cards from the judge's text, with the opportunity as the source", () => {
    const [card] = buildCards(ranked(["testbed", "Curated"]), { weekOf: "2026-11-09", companyTags: [] });
    expect(card).toEqual({
      position: 1,
      kind: "match",
      opportunityId: "o1",
      trendNoteId: null,
      title: "Opportunity 1",
      why: "Why 1.",
      nextStep: "Next step 1.",
      uncertainties: ["Open question 1"],
      sources: [{ url: "https://example.org/1", title: "Opportunity 1" }],
    });
  });

  it("has no trend card without a fitting note", () => {
    const cards = buildCards(ranked(["funding", "A"], ["testbed", "B"], ["event", "C"], ["funding", "D"], ["testbed", "E"]), {
      trendNotes: [],
      weekOf: "2026-11-09",
      companyTags: ["marine"],
    });
    expect(cards.map((c) => c.kind)).toEqual(["match", "match", "match", "match", "match"]);
  });
});
