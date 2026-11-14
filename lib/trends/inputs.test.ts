import { describe, expect, it } from "vitest";
import { isNew, MAX_INPUTS, selectInputs, type TrendCandidate } from "./inputs";

const NOW = new Date("2026-11-14T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
const daysAhead = (days: number) => daysAgo(-days);

let next = 0;
function row(fields: Partial<TrendCandidate>): TrendCandidate {
  next++;
  return {
    id: `id-${next}`,
    kind: "funding",
    source: "Vinnova",
    externalId: `call-${next}`,
    title: `Call ${next}`,
    url: `https://example.org/${next}`,
    description: null,
    tags: ["marine"],
    deadline: null,
    opensAt: null,
    publishedAt: null,
    createdAt: daysAgo(1),
    simulated: false,
    ...fields,
  };
}

const titles = (rows: TrendCandidate[]) => rows.map((r) => r.title);

describe("isNew", () => {
  it("counts a call as new for 7 days after it was first stored", () => {
    expect(isNew(row({ createdAt: daysAgo(6.9) }), NOW)).toBe(true);
    expect(isNew(row({ createdAt: daysAgo(7.1) }), NOW)).toBe(false);
  });

  it("counts a news item by its publish date, for 14 days", () => {
    expect(isNew(row({ kind: "news", publishedAt: daysAgo(13), createdAt: daysAgo(30) }), NOW)).toBe(true);
    expect(isNew(row({ kind: "news", publishedAt: daysAgo(15), createdAt: daysAgo(30) }), NOW)).toBe(false);
    // An old article the collector only picked up now is not this week's news.
    expect(isNew(row({ kind: "news", publishedAt: daysAgo(40), createdAt: daysAgo(0) }), NOW)).toBe(false);
  });

  it("counts a news item without a publish date by when it was stored", () => {
    expect(isNew(row({ kind: "news", publishedAt: null, createdAt: daysAgo(2) }), NOW)).toBe(true);
    expect(isNew(row({ kind: "news", publishedAt: null, createdAt: daysAgo(8) }), NOW)).toBe(false);
  });
});

describe("selectInputs", () => {
  it("keeps only rows tagged with the area", () => {
    const rows = [row({ title: "marine", tags: ["marine", "sensor"] }), row({ title: "cyber", tags: ["cyber"] }), row({ title: "none", tags: [] })];
    expect(titles(selectInputs(rows, "marine", NOW))).toEqual(["marine"]);
    expect(titles(selectInputs(rows, "sensor", NOW))).toEqual(["marine"]);
  });

  it("leaves out samples, hand-entered rows, old rows and funding whose deadline has passed", () => {
    const rows = [
      row({ title: "kept" }),
      row({ title: "fixture", externalId: "fixture-vinnova-1" }),
      row({ title: "simulated", simulated: true }),
      row({ title: "old", createdAt: daysAgo(20) }),
      row({ title: "closed", deadline: daysAgo(1) }),
      row({ title: "closes later today", deadline: new Date(NOW.getTime() + 60_000) }),
    ];
    expect(titles(selectInputs(rows, "marine", NOW))).toEqual(["closes later today", "kept"]);
  });

  it("puts news first, newest first, then the rest by nearest deadline, no deadline last", () => {
    const rows = [
      row({ title: "call, no deadline" }),
      row({ title: "call in 30 days", deadline: daysAhead(30) }),
      row({ title: "older news", kind: "news", publishedAt: daysAgo(10) }),
      row({ title: "call in 5 days", deadline: daysAhead(5) }),
      row({ title: "newer news", kind: "news", publishedAt: daysAgo(1) }),
      row({ title: "event in 3 days", kind: "event", deadline: daysAhead(3) }),
    ];
    expect(titles(selectInputs(rows, "marine", NOW))).toEqual([
      "newer news",
      "older news",
      "event in 3 days",
      "call in 5 days",
      "call in 30 days",
      "call, no deadline",
    ]);
  });

  it("breaks ties by title, so the same rows always give the same order", () => {
    const deadline = daysAhead(10);
    const rows = [row({ title: "b", deadline }), row({ title: "a", deadline }), row({ title: "c", deadline })];
    expect(titles(selectInputs(rows, "marine", NOW))).toEqual(["a", "b", "c"]);
    expect(titles(selectInputs([...rows].reverse(), "marine", NOW))).toEqual(["a", "b", "c"]);
  });

  it(`keeps at most ${MAX_INPUTS}, the nearest deadlines`, () => {
    const rows = Array.from({ length: 12 }, (_, i) => row({ title: `call ${String(i).padStart(2, "0")}`, deadline: daysAhead(12 - i) }));
    const picked = selectInputs(rows, "marine", NOW);
    expect(picked).toHaveLength(MAX_INPUTS);
    expect(picked[0].title).toBe("call 11");
    expect(picked.at(-1)!.title).toBe("call 04");
  });

  it("gives an empty list when nothing is new", () => {
    expect(selectInputs([row({ createdAt: daysAgo(30) })], "marine", NOW)).toEqual([]);
  });
});
