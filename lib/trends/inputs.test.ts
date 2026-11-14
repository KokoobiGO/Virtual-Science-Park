import { describe, expect, it } from "vitest";
import { isFresh, isNew, MAX_INPUTS, selectInputs, tooFewReason, type TrendCandidate } from "./inputs";

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

describe("isFresh", () => {
  it("counts news from the last 14 days", () => {
    expect(isFresh(row({ kind: "news", publishedAt: daysAgo(13) }), NOW)).toBe(true);
    expect(isFresh(row({ kind: "news", publishedAt: daysAgo(15) }), NOW)).toBe(false);
    expect(isFresh(row({ kind: "news", publishedAt: null }), NOW)).toBe(true);
  });

  it("counts a call by its opening date: opened in the last 14 days, or opens in the next 14", () => {
    expect(isFresh(row({ opensAt: daysAgo(3) }), NOW)).toBe(true);
    expect(isFresh(row({ opensAt: daysAgo(40), createdAt: daysAgo(0) }), NOW)).toBe(false);
    expect(isFresh(row({ opensAt: daysAhead(2) }), NOW)).toBe(true);
    expect(isFresh(row({ opensAt: daysAhead(20) }), NOW)).toBe(false);
    // The opening date decides, even when the call was published lately.
    expect(isFresh(row({ opensAt: daysAgo(40), publishedAt: daysAgo(2) }), NOW)).toBe(false);
  });

  it("counts a call without an opening date by its publish date, and one with neither as fresh", () => {
    expect(isFresh(row({ publishedAt: daysAgo(2) }), NOW)).toBe(true);
    expect(isFresh(row({ publishedAt: daysAgo(30) }), NOW)).toBe(false);
    expect(isFresh(row({}), NOW)).toBe(true);
  });
});

describe("tooFewReason", () => {
  it("needs two inputs, and at least one fresh one", () => {
    expect(tooFewReason([row({})], NOW)).toMatch(/1 new input this week; a note needs 2/);
    expect(tooFewReason([], NOW)).toMatch(/0 new inputs/);
    const stale = [row({ opensAt: daysAgo(60) }), row({ opensAt: daysAgo(90) })];
    expect(tooFewReason(stale, NOW)).toMatch(/nothing changed this week/);
    expect(tooFewReason([...stale, row({ kind: "news", publishedAt: daysAgo(1) })], NOW)).toBeNull();
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

  it("puts fresh rows before the others, whatever their deadlines", () => {
    const rows = [
      row({ title: "open for months, closes soon", opensAt: daysAgo(60), deadline: daysAhead(2) }),
      row({ title: "opened this week", opensAt: daysAgo(2), deadline: daysAhead(90) }),
      row({ title: "old news", kind: "news", publishedAt: daysAgo(13) }),
      row({ title: "opens soon", opensAt: daysAhead(3), deadline: daysAhead(60) }),
    ];
    expect(titles(selectInputs(rows, "marine", NOW))).toEqual(["old news", "opens soon", "opened this week", "open for months, closes soon"]);
  });

  it("gives an empty list when nothing is new", () => {
    expect(selectInputs([row({ createdAt: daysAgo(30) })], "marine", NOW)).toEqual([]);
  });
});
