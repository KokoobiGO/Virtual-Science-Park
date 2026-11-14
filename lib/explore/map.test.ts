import { describe, expect, it } from "vitest";
import { NO_FILTERS, type ExploreItem } from "./filter";
import {
  buildTestbedMap,
  frameHeight,
  frameScale,
  inFrame,
  labelBox,
  PIN_CLEARANCE,
  PIN_GAP,
  placeLabel,
  project,
  ringPath,
  ringRadius,
  SOUTHERN_SWEDEN,
  spreadPins,
  type Frame,
} from "./map";
import { LAKES, LAND } from "./sweden-outline";
import { TOWNS } from "./testbed-places";

const FRAME: Frame = { west: 10, east: 20, south: 55, north: 60, standardParallel: 60, width: 500 };
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe("project (equirectangular with a standard parallel)", () => {
  it("puts the north-west corner at (0, 0) and the south-east corner at (width, height)", () => {
    // cos 60° = 0.5, so 10° of longitude are as wide as 5° of latitude: 100 units per degree of latitude.
    expect(frameScale(FRAME)).toBeCloseTo(100);
    expect(frameHeight(FRAME)).toBeCloseTo(500);
    const nw = project(FRAME, [10, 60]);
    const se = project(FRAME, [20, 55]);
    expect(nw.x).toBeCloseTo(0);
    expect(nw.y).toBeCloseTo(0);
    expect(se.x).toBeCloseTo(500);
    expect(se.y).toBeCloseTo(500);
  });

  it("shrinks a degree of longitude by the cosine of the standard parallel", () => {
    const a = project(FRAME, [15, 57]);
    const east = project(FRAME, [16, 57]);
    const north = project(FRAME, [15, 58]);
    expect(east.x - a.x).toBeCloseTo(50);
    expect(east.y).toBeCloseTo(a.y);
    expect(a.y - north.y).toBeCloseTo(100);
    expect(north.x).toBeCloseTo(a.x);
  });

  it("places the reference towns where they belong", () => {
    const at = (key: keyof typeof TOWNS) => project(SOUTHERN_SWEDEN, [TOWNS[key].lon, TOWNS[key].lat]);
    expect(at("gothenburg").x).toBeLessThan(at("linkoping").x);
    expect(at("linkoping").x).toBeLessThan(at("stockholm").x);
    expect(at("stockholm").y).toBeLessThan(at("linkoping").y);
    expect(at("linkoping").y).toBeLessThan(at("karlskrona").y);
    expect(at("karlskrona").y).toBeLessThan(at("malmo").y);
    for (const town of Object.values(TOWNS)) expect(inFrame(SOUTHERN_SWEDEN, [town.lon, town.lat]), town.name).toBe(true);
  });

  it("knows what is inside the frame", () => {
    expect(inFrame(FRAME, [15, 57])).toBe(true);
    expect(inFrame(FRAME, [22.15, 65.58])).toBe(false);
    expect(inFrame(FRAME, [9.9, 57])).toBe(false);
  });

  it("draws a ring as a closed path", () => {
    expect(
      ringPath(FRAME, [
        [10, 60],
        [20, 60],
        [15, 55],
      ]),
    ).toBe("M0.0 0.0 L500.0 0.0 L250.0 500.0 Z");
    for (const ring of [...LAND, ...LAKES]) expect(ringPath(SOUTHERN_SWEDEN, ring)).not.toContain("NaN");
  });
});

describe("spreadPins", () => {
  it("leaves a pin alone in its town where it is", () => {
    const [pin] = spreadPins([{ x: 10, y: 20, group: "Linköping" }]);
    expect(pin).toMatchObject({ x: 10, y: 20, anchor: { x: 10, y: 20 } });
    expect(ringRadius(1)).toBe(0);
    expect(ringRadius(0)).toBe(0);
  });

  it("puts two pins of one town a full gap apart, centred on the town", () => {
    const pins = spreadPins([
      { x: 100, y: 100, group: "A" },
      { x: 100, y: 100, group: "A" },
    ]);
    expect(ringRadius(2)).toBeCloseTo(PIN_GAP / 2);
    expect(dist(pins[0], pins[1])).toBeCloseTo(PIN_GAP);
    expect((pins[0].x + pins[1].x) / 2).toBeCloseTo(100);
    expect((pins[0].y + pins[1].y) / 2).toBeCloseTo(100);
    // The first one at the top.
    expect(pins[0].y).toBeCloseTo(100 - PIN_GAP / 2);
  });

  it("rings five pins of one town so no two are closer than the gap, and leaves other towns alone", () => {
    const town = { x: 200, y: 400, group: "Karlskrona" };
    const pins = spreadPins([town, town, { x: 50, y: 50, group: "Linköping" }, town, town, town]);
    const ring = pins.filter((p) => p.group === "Karlskrona");
    expect(ring).toHaveLength(5);
    for (const p of ring) {
      expect(p.anchor).toEqual({ x: 200, y: 400 });
      expect(dist(p, p.anchor)).toBeCloseTo(ringRadius(5));
    }
    for (let i = 0; i < ring.length; i++) {
      for (let j = i + 1; j < ring.length; j++) expect(dist(ring[i], ring[j])).toBeGreaterThanOrEqual(PIN_GAP - 1e-9);
    }
    expect(pins[2]).toMatchObject({ x: 50, y: 50, group: "Linköping" });
  });
});

describe("placeLabel", () => {
  const size = { width: 400, height: 400 };
  const town = { x: 100, y: 100, name: "Town" };

  it("puts the label just right of the dot when nothing is in the way", () => {
    expect(placeLabel(town, [], size)).toEqual({ x: 106, y: 104, anchor: "start" });
  });

  it("moves it clear of a pin on the dot, and to another side when a pin sits on the right", () => {
    expect(placeLabel(town, [{ x: 100, y: 100 }], size)).toEqual({ x: 100 + PIN_CLEARANCE + 1, y: 104, anchor: "start" });
    expect(placeLabel(town, [{ x: 100, y: 100 }, { x: 130, y: 98 }], size)).toEqual({ x: 86, y: 104, anchor: "end" });
  });

  it("stays inside the frame", () => {
    const edge = { x: 390, y: 100, name: "Stockholm" };
    expect(placeLabel(edge, [], size).anchor).toBe("end");
  });
});

let counter = 0;
function testbed(externalId: string, overrides: Partial<ExploreItem> = {}): ExploreItem {
  counter += 1;
  return {
    id: `id-${counter}`,
    kind: "testbed",
    source: "Curated testbed list",
    externalId,
    title: externalId,
    url: "https://example.org",
    description: null,
    opensAt: null,
    deadline: null,
    eventDate: null,
    tags: [],
    simulated: true,
    verified: true,
    ...overrides,
  };
}

describe("buildTestbedMap", () => {
  const salto = testbed("mtc-salto-karlskrona", { title: "MTC Saltö", tags: ["marine"] });
  const bth = testbed("mtc-test-bed-bth", { title: "MTC Test Bed at BTH", tags: ["marine"], verified: false });
  const fmv = testbed("fmv-naval-test-ranges", { title: "FMV Naval Test Ranges", tags: ["marine", "defence"] });
  const crate = testbed("foi-crate", { title: "CRATE cyber range", tags: ["cyber"] });
  const nowhere = testbed("not-in-the-list", { title: "Nowhere lab", tags: ["ai"] });
  const call = { ...testbed("some-call"), kind: "funding" as const, title: "A call in Karlskrona" };
  const all = [nowhere, salto, call, crate, bth, fmv];

  it("pins the test facilities with a stored place and lists the rest", () => {
    const map = buildTestbedMap(all, NO_FILTERS);
    expect(map.total).toBe(5);
    // North to south: Linköping first, then Karlskrona's three by title.
    expect(map.pins.map((p) => [p.title, p.town])).toEqual([
      ["CRATE cyber range", "Linköping"],
      ["FMV Naval Test Ranges", "Karlskrona"],
      ["MTC Saltö", "Karlskrona"],
      ["MTC Test Bed at BTH", "Karlskrona"],
    ]);
    expect(map.unplaced).toEqual([{ item: nowhere, outsideTown: null }]);
    expect(map.pins.find((p) => p.title === "MTC Test Bed at BTH")?.verified).toBe(false);
    expect(map.pins.find((p) => p.title === "MTC Saltö")?.verified).toBe(true);
    expect(map.pins[0].placeSource).toBe('From the description: "the main facility is in Linköping…".');
    for (const pin of map.pins) {
      expect(pin.x).toBeGreaterThan(0);
      expect(pin.x).toBeLessThan(map.width);
      expect(pin.y).toBeGreaterThan(0);
      expect(pin.y).toBeLessThan(map.height);
    }
  });

  it("spreads the pins of one town and keeps every town label clear of every pin", () => {
    const map = buildTestbedMap(all, NO_FILTERS);
    const karlskrona = map.pins.filter((p) => p.town === "Karlskrona");
    for (let i = 0; i < karlskrona.length; i++) {
      for (let j = i + 1; j < karlskrona.length; j++) expect(dist(karlskrona[i], karlskrona[j])).toBeGreaterThanOrEqual(PIN_GAP - 1e-9);
    }
    for (const town of map.towns) {
      const box = labelBox(town.label, town.name);
      expect(box.left, town.name).toBeGreaterThanOrEqual(0);
      expect(box.right, town.name).toBeLessThanOrEqual(map.width);
      for (const pin of map.pins) {
        const dx = Math.max(box.left - pin.x, 0, pin.x - box.right);
        const dy = Math.max(box.top - pin.y, 0, pin.y - box.bottom);
        expect(Math.hypot(dx, dy), `${town.name} label vs ${pin.title}`).toBeGreaterThanOrEqual(PIN_CLEARANCE);
      }
    }
    const gothenburg = map.towns.find((t) => t.name === "Gothenburg")!;
    expect(gothenburg.label).toEqual({ x: gothenburg.x + 6, y: gothenburg.y + 4, anchor: "start" });
  });

  it("applies the tag and the search, and never the kind of other items", () => {
    expect(buildTestbedMap(all, { tag: "cyber", q: "" }).pins.map((p) => p.title)).toEqual(["CRATE cyber range"]);
    expect(buildTestbedMap(all, { tag: null, q: "mtc" }).pins.map((p) => p.title)).toEqual(["MTC Saltö", "MTC Test Bed at BTH"]);
    expect(buildTestbedMap(all, { tag: null, q: "karlskrona" }).pins).toEqual([]);
    expect(buildTestbedMap(all, { tag: "ai", q: "" })).toMatchObject({ pins: [], unplaced: [{ item: nowhere }], total: 5 });
  });

  it("lists a facility whose town is outside the drawn area instead of pinning it off the map", () => {
    const north: Frame = { ...SOUTHERN_SWEDEN, south: 57 };
    const map = buildTestbedMap([crate, salto], NO_FILTERS, north);
    expect(map.pins.map((p) => p.title)).toEqual(["CRATE cyber range"]);
    expect(map.unplaced).toEqual([{ item: salto, outsideTown: "Karlskrona" }]);
  });
});
