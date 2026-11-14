import { describe, expect, it } from "vitest";
import { daysUntil, formatDay, monthKey, monthLabel, monthRange, shortMonthLabel } from "./dates";
import { NO_FILTERS, type ExploreItem } from "./filter";
import { buildTimeline, groupByMonth, monthCounts } from "./timeline";

const NOW = new Date("2026-11-14T12:00:00Z");

let counter = 0;
function item(overrides: Partial<ExploreItem> = {}): ExploreItem {
  counter += 1;
  return {
    id: `id-${counter}`,
    kind: "funding",
    source: "EU Funding & Tenders",
    externalId: `item-${counter}`,
    title: `Item ${counter}`,
    url: "https://example.org",
    description: null,
    opensAt: null,
    deadline: null,
    eventDate: null,
    tags: [],
    simulated: false,
    verified: null,
    ...overrides,
  };
}

describe("dates", () => {
  it("uses Swedish time for days and months", () => {
    // 23:30 UTC on 30 November is already 1 December in Karlskrona.
    const late = new Date("2026-11-30T23:30:00Z");
    expect(formatDay(late)).toBe("1 Dec 2026");
    expect(monthKey(late)).toBe("2026-12");
    expect(monthKey(new Date("2026-11-30T12:00:00Z"))).toBe("2026-11");
    expect(monthLabel("2027-01")).toBe("January 2027");
    expect(shortMonthLabel("2027-01")).toBe("Jan");
  });

  it("lists every month across a year end", () => {
    expect(monthRange("2026-11", "2027-02")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(monthRange("2027-03", "2027-03")).toEqual(["2027-03"]);
    expect(monthRange("2027-04", "2027-03")).toEqual([]);
  });

  it("counts calendar days left in Swedish time", () => {
    expect(daysUntil(new Date("2026-11-14T22:00:00Z"), NOW)).toBe(0);
    expect(daysUntil(new Date("2026-11-15T22:59:00Z"), NOW)).toBe(1);
    expect(daysUntil(new Date("2026-11-18T22:59:00Z"), NOW)).toBe(4);
    // 23:30 UTC on the 18th is already the 19th in Karlskrona.
    expect(daysUntil(new Date("2026-11-18T23:30:00Z"), NOW)).toBe(5);
    expect(daysUntil(new Date("2026-11-01T12:00:00Z"), NOW)).toBe(0);
  });
});

describe("groupByMonth", () => {
  it("groups in date order", () => {
    const dec = item({ deadline: new Date("2026-12-10T10:00:00Z") });
    const nov = item({ deadline: new Date("2026-11-20T10:00:00Z") });
    const dec2 = item({ deadline: new Date("2026-12-01T10:00:00Z") });
    const groups = groupByMonth([dec, nov, dec2], (i) => i.deadline!);
    expect(groups.map((g) => [g.key, g.label, g.items.map((i) => i.id)])).toEqual([
      ["2026-11", "November 2026", [nov.id]],
      ["2026-12", "December 2026", [dec2.id, dec.id]],
    ]);
  });

  it("counts every month between the first and the last, empty ones too", () => {
    const groups = groupByMonth(
      [item({ deadline: new Date("2026-11-20T10:00:00Z") }), item({ deadline: new Date("2027-02-02T10:00:00Z") })],
      (i) => i.deadline!,
    );
    expect(monthCounts(groups)).toEqual([
      { key: "2026-11", count: 1 },
      { key: "2026-12", count: 0 },
      { key: "2027-01", count: 0 },
      { key: "2027-02", count: 1 },
    ]);
    expect(monthCounts([])).toEqual([]);
  });
});

describe("buildTimeline", () => {
  const openCall = item({ title: "Open marine call", deadline: new Date("2026-12-01T22:59:00Z"), tags: ["marine"] });
  const laterCall = item({ title: "Later call", opensAt: new Date("2027-03-01T00:00:00Z"), deadline: new Date("2027-06-01T00:00:00Z") });
  const closedCall = item({ title: "Closed call", deadline: new Date("2026-11-04T22:59:00Z") });
  const undatedCall = item({ title: "Rolling call" });
  const event = item({ kind: "event", title: "Marine day", eventDate: new Date("2026-11-18T23:00:00Z"), tags: ["marine"] });
  const pastEvent = item({ kind: "event", title: "Old meetup", eventDate: new Date("2026-10-01T16:00:00Z") });
  const series = item({ kind: "event", title: "Marine Wednesdays", simulated: true });
  const testbed = item({ kind: "testbed", title: "Test range", deadline: new Date("2026-12-24T00:00:00Z") });
  const all = [openCall, laterCall, closedCall, undatedCall, event, pastEvent, series, testbed];

  it("keeps calls whose deadline has not passed, and dated coming events", () => {
    const timeline = buildTimeline(all, NO_FILTERS, NOW);
    expect(timeline.calls.map((g) => [g.key, g.items.map((i) => i.title)])).toEqual([
      ["2026-12", ["Open marine call"]],
      ["2027-06", ["Later call"]],
    ]);
    expect(timeline.events.map((g) => [g.key, g.items.map((i) => i.title)])).toEqual([["2026-11", ["Marine day"]]]);
    expect(timeline.undatedEvents.map((i) => i.title)).toEqual(["Marine Wednesdays"]);
  });

  it("applies the tag and the search", () => {
    const timeline = buildTimeline(all, { tag: "marine", q: "" }, NOW);
    expect(timeline.calls.flatMap((g) => g.items)).toEqual([openCall]);
    expect(timeline.events.flatMap((g) => g.items)).toEqual([event]);
    expect(timeline.undatedEvents).toEqual([]);
    expect(buildTimeline(all, { tag: null, q: "later" }, NOW).calls.flatMap((g) => g.items)).toEqual([laterCall]);
  });
});
