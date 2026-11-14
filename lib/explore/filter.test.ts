import { describe, expect, it } from "vitest";
import {
  dateLabel,
  dateStatus,
  filterItems,
  filtersToQuery,
  matchesQuery,
  NO_FILTERS,
  parseFilters,
  personalMatchMap,
  type ExploreItem,
} from "./filter";

const NOW = new Date("2026-11-14T12:00:00Z");
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

let counter = 0;
function item(overrides: Partial<ExploreItem> = {}): ExploreItem {
  counter += 1;
  return {
    id: `id-${counter}`,
    kind: "funding",
    source: "Vinnova",
    title: `Call ${counter}`,
    url: "https://example.org",
    description: null,
    opensAt: null,
    deadline: null,
    eventDate: null,
    tags: [],
    simulated: false,
    ...overrides,
  };
}

describe("parseFilters", () => {
  it("reads known values and ignores the rest", () => {
    expect(parseFilters({ kind: "testbed", tag: "marine", due: "soon", q: "  ocean   wind ", view: "timeline" })).toEqual({
      kind: "testbed",
      tag: "marine",
      due: "soon",
      q: "ocean wind",
      view: "timeline",
    });
    expect(parseFilters({ kind: "grant", tag: "space", due: "later", view: "map" })).toEqual(NO_FILTERS);
    expect(parseFilters({})).toEqual(NO_FILTERS);
  });

  it("takes the first of repeated values and caps the query", () => {
    expect(parseFilters({ kind: ["event", "funding"] }).kind).toBe("event");
    expect(parseFilters({ q: "x".repeat(500) }).q).toHaveLength(100);
  });

  it("round-trips through the query string", () => {
    const filters = parseFilters({ kind: "event", tag: "ai", due: "open", q: "agent" });
    const query = filtersToQuery(filters);
    expect(query).toBe("?kind=event&tag=ai&due=open&q=agent");
    expect(parseFilters(Object.fromEntries(new URLSearchParams(query)))).toEqual(filters);
    expect(filtersToQuery(filters, { view: "timeline", kind: null })).toBe("?view=timeline&tag=ai&due=open&q=agent");
    expect(filtersToQuery(NO_FILTERS)).toBe("");
  });
});

describe("dateStatus (deadline buckets)", () => {
  it("puts each item in one bucket", () => {
    expect(dateStatus(item(), NOW)).toBe("no_date");
    expect(dateStatus(item({ deadline: days(-1) }), NOW)).toBe("closed");
    expect(dateStatus(item({ deadline: days(10) }), NOW)).toBe("closing_soon");
    expect(dateStatus(item({ deadline: days(30) }), NOW)).toBe("closing_soon");
    expect(dateStatus(item({ deadline: days(31) }), NOW)).toBe("open");
    expect(dateStatus(item({ opensAt: days(5), deadline: days(90) }), NOW)).toBe("opens_later");
    expect(dateStatus(item({ opensAt: days(-5), deadline: days(90) }), NOW)).toBe("open");
  });

  it("uses an event's date when there is no deadline", () => {
    expect(dateStatus(item({ kind: "event", eventDate: days(4) }), NOW)).toBe("closing_soon");
    expect(dateStatus(item({ kind: "event", eventDate: days(-4) }), NOW)).toBe("closed");
  });
});

describe("filterItems", () => {
  const soonCall = item({ title: "Soon call", deadline: days(5), tags: ["marine"] });
  const laterCall = item({ title: "Later call", deadline: days(200), tags: ["ai"] });
  const futureCall = item({ title: "Future call", opensAt: days(40), deadline: days(120) });
  const closedCall = item({ title: "Closed call", deadline: days(-3) });
  const testbed = item({ kind: "testbed", title: "Naval test range", tags: ["marine", "defence"], simulated: true });
  const event = item({ kind: "event", title: "Marine Innovation Day", eventDate: days(20), tags: ["marine"] });
  const all = [closedCall, testbed, laterCall, event, futureCall, soonCall];

  it("lists coming dates first, then no date, then closed", () => {
    expect(filterItems(all, NO_FILTERS, NOW).map((i) => i.title)).toEqual([
      "Soon call",
      "Marine Innovation Day",
      "Future call",
      "Later call",
      "Naval test range",
      "Closed call",
    ]);
  });

  it("filters by kind", () => {
    expect(filterItems(all, { ...NO_FILTERS, kind: "testbed" }, NOW)).toEqual([testbed]);
    expect(filterItems(all, { ...NO_FILTERS, kind: "event" }, NOW)).toEqual([event]);
  });

  it("filters by deadline bucket", () => {
    expect(filterItems(all, { ...NO_FILTERS, due: "open" }, NOW).map((i) => i.title)).toEqual(["Soon call", "Marine Innovation Day", "Later call"]);
    expect(filterItems(all, { ...NO_FILTERS, due: "soon" }, NOW).map((i) => i.title)).toEqual(["Soon call", "Marine Innovation Day"]);
    expect(filterItems(all, { ...NO_FILTERS, due: "none" }, NOW)).toEqual([testbed]);
  });

  it("filters by tag and combines filters", () => {
    expect(filterItems(all, { ...NO_FILTERS, tag: "marine" }, NOW).map((i) => i.title)).toEqual(["Soon call", "Marine Innovation Day", "Naval test range"]);
    expect(filterItems(all, { ...NO_FILTERS, tag: "marine", kind: "funding", due: "soon" }, NOW)).toEqual([soonCall]);
  });

  it("searches the title", () => {
    expect(filterItems(all, { ...NO_FILTERS, q: "call later" }, NOW)).toEqual([laterCall]);
    expect(filterItems(all, { ...NO_FILTERS, q: "nothing like this" }, NOW)).toEqual([]);
  });
});

describe("matchesQuery", () => {
  it("ignores case and accents and needs every word", () => {
    expect(matchesQuery("Försvarsmaktens innovationsdag", "forsvar")).toBe(true);
    expect(matchesQuery("Smart ENERGY grids", "grids energy")).toBe(true);
    expect(matchesQuery("Smart energy grids", "energy cables")).toBe(false);
    expect(matchesQuery("Anything", "  ")).toBe(true);
  });
});

describe("dateLabel", () => {
  it("says what the date is, in Swedish time", () => {
    // 22:59 UTC on 1 December is 23:59 in Karlskrona.
    expect(dateLabel(item({ deadline: new Date("2027-12-01T22:59:00Z") }), NOW)).toBe("Deadline 1 Dec 2027");
    // 23:00 UTC on 18 November is midnight of the 19th in Karlskrona.
    expect(dateLabel(item({ kind: "event", eventDate: new Date("2026-11-18T23:00:00Z") }), NOW)).toBe("19 Nov 2026 (in 5 days)");
    expect(dateLabel(item({ deadline: days(1) }), NOW)).toMatch(/\(tomorrow\)$/);
    // 13:00 in Karlskrona, the deadline at 23:59 the same day.
    expect(dateLabel(item({ deadline: new Date("2026-11-14T22:59:00Z") }), NOW)).toBe("Deadline 14 Nov 2026 (today)");
    // Tomorrow at 23:59 is one day away, not two, however many hours are left.
    expect(dateLabel(item({ deadline: new Date("2026-11-15T22:59:00Z") }), NOW)).toBe("Deadline 15 Nov 2026 (tomorrow)");
    expect(dateLabel(item({ opensAt: new Date("2027-08-03T23:00:00Z"), deadline: new Date("2027-12-01T22:59:00Z") }), NOW)).toBe(
      "Opens 4 Aug 2027, deadline 1 Dec 2027",
    );
    expect(dateLabel(item({ deadline: new Date("2026-11-04T22:59:00Z") }), NOW)).toBe("Closed 4 Nov 2026");
    expect(dateLabel(item(), NOW)).toBe("No date");
  });
});

describe("personalMatchMap", () => {
  it("never counts a rejected row or one without a rank as a match", () => {
    const map = personalMatchMap([
      { opportunityId: "a", rank: 3, rejected: false, why: "Fits the sensors." },
      { opportunityId: "b", rank: 1, rejected: true, why: "Kept by mistake?" },
      { opportunityId: "c", rank: null, rejected: false, why: "Fell out of the top 20." },
      { opportunityId: "d", rank: 2, rejected: false, why: null },
      { opportunityId: "e", rank: 5, rejected: false, why: "   " },
    ]);
    expect([...map.keys()]).toEqual(["d", "a", "e"]);
    expect(map.get("d")).toEqual({ position: 1, rank: 2, why: null });
    expect(map.get("a")).toEqual({ position: 2, rank: 3, why: "Fits the sensors." });
    expect(map.get("e")?.why).toBeNull();
    expect(map.has("b")).toBe(false);
    expect(map.has("c")).toBe(false);
  });
});
