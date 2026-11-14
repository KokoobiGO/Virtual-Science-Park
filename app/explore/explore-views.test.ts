import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NO_FILTERS, type ExploreItem } from "@/lib/explore/filter";
import { buildTestbedMap } from "@/lib/explore/map";
import { buildTimeline } from "@/lib/explore/timeline";
import { ExploreList } from "./explore-list";
import { ExploreMap } from "./explore-map";
import { ExploreTimeline } from "./explore-timeline";

const NOW = new Date("2026-11-14T12:00:00Z");
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

function item(id: string, overrides: Partial<ExploreItem> = {}): ExploreItem {
  return {
    id,
    kind: "funding",
    source: "Vinnova",
    externalId: id,
    title: `Title ${id}`,
    url: `https://example.org/${id}`,
    description: null,
    opensAt: null,
    deadline: days(60),
    eventDate: null,
    tags: [],
    simulated: false,
    verified: null,
    sourceState: "live",
    cachedAt: null,
    ...overrides,
  };
}

const live = item("live");
const cached = item("cached", { source: "EU Funding & Tenders", sourceState: "cached", cachedAt: new Date("2026-11-10T02:00:00Z") });
const hand = item("hand", { kind: "event", source: "BSP events", deadline: null, eventDate: days(20), simulated: true, sourceState: "simulated" });
const facility = item("mtc-salto-karlskrona", { kind: "testbed", source: "Curated testbed list", deadline: null, simulated: true, sourceState: "simulated", verified: true });
const all = [live, cached, hand, facility];

/** The labels of one list row, by item id. */
function rowLabels(html: string, id: string): string[] {
  const row = html.split(`id="opportunity-${id}"`)[1]?.split("</li>")[0] ?? "";
  return [...row.matchAll(/data-data-status="([a-z_]+)"[^>]*>(?:<svg[\s\S]*?<\/svg>)?([^<]*)/g)].map((m) => `${m[1]}: ${m[2]}`);
}

describe("data status labels on the explorer (D20)", () => {
  it("labels hand-entered and cached items in the list, and leaves live ones alone", () => {
    const html = renderToString(createElement(ExploreList, { items: all, total: all.length, matches: null, filters: NO_FILTERS, now: NOW }));
    expect(rowLabels(html, "live")).toEqual([]);
    expect(rowLabels(html, "cached")).toEqual(["cached: Cached copy · 10 Nov 2026"]);
    expect(rowLabels(html, "hand")).toEqual(["hand_entered: Hand-entered"]);
    expect(html).not.toContain(">Simulated<");
  });

  it("labels them in the timeline and on the map card too", () => {
    const timeline = renderToString(createElement(ExploreTimeline, { timeline: buildTimeline(all, NO_FILTERS, NOW), matches: null, filters: NO_FILTERS, now: NOW }));
    expect(timeline).toContain("Cached copy · 10 Nov 2026");
    expect(timeline).toContain("Hand-entered");

    const map = renderToString(createElement(ExploreMap, { map: buildTestbedMap([facility], NO_FILTERS), matches: null, filters: NO_FILTERS }));
    // The selected pin's card is rendered by the picker on the client; the cards below the map render here.
    expect(map).toContain("Test facilities on the map");
    const unplaced = renderToString(createElement(ExploreMap, { map: buildTestbedMap([{ ...facility, externalId: "nowhere" }], NO_FILTERS), matches: null, filters: NO_FILTERS }));
    expect(unplaced).toContain("Location not stored");
    expect(unplaced).toContain("Hand-entered");
  });
});

describe("empty states", () => {
  it("says what is missing and offers to clear the filters", () => {
    const filters = { ...NO_FILTERS, q: "nothing like this" };
    const html = renderToString(createElement(ExploreList, { items: [], total: all.length, matches: null, filters, now: NOW }));
    expect(html).toContain("No opportunity fits these filters.");
    expect(html).toMatch(/href="\/explore"[^>]*>Clear the filters</);
  });

  it("says nothing is collected yet when the store is empty, without a clear link", () => {
    const html = renderToString(createElement(ExploreList, { items: [], total: 0, matches: null, filters: NO_FILTERS, now: NOW }));
    expect(html).toContain("No opportunities have been collected yet.");
    expect(html).not.toContain("Clear the filters");
  });

  it("keeps the view when the timeline or the map clears its filters", () => {
    const timelineFilters = { ...NO_FILTERS, view: "timeline" as const, tag: "cyber" as const };
    const timeline = renderToString(createElement(ExploreTimeline, { timeline: buildTimeline(all, timelineFilters, NOW), matches: null, filters: timelineFilters, now: NOW }));
    expect(timeline).toContain("No open funding call fits these filters.");
    expect(timeline).toContain('href="/explore?view=timeline"');

    const mapFilters = { ...NO_FILTERS, view: "map" as const, q: "moon base" };
    const map = renderToString(createElement(ExploreMap, { map: buildTestbedMap(all, mapFilters), matches: null, filters: mapFilters }));
    expect(map).toContain("No test facility fits these filters.");
    expect(map).toContain('href="/explore?view=map"');
  });
});
