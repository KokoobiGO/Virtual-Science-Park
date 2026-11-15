/**
 * The explorer's third view (C15): test facilities as pins on a sketch map of
 * southern Sweden. Pure, so the projection, the place lookup and the pin
 * spreading are unit-tested.
 *
 * The projection is the plain equirectangular one with a standard parallel:
 * x grows with longitude times cos(standard parallel), y with latitude, both
 * on the same scale, so the shape is right near the middle of the frame.
 */
import { DEFAULT_LOCALE, type Locale } from "../i18n/config";
import { filterByTagAndQuery, type ExploreFilters, type ExploreItem } from "./filter";
import { placeFor, placeSourceLine, TOWNS, type Town } from "./testbed-places";

export type LonLat = readonly [lon: number, lat: number];

export type Frame = {
  /** Degrees east and north of the drawn area's edges. */
  west: number;
  east: number;
  south: number;
  north: number;
  /** Latitude where east-west distances are true to scale. */
  standardParallel: number;
  /** Width of the drawing in SVG units; the height follows. */
  width: number;
};

/** Southern Sweden, from Skåne up to Gävle, with Gotland. */
export const SOUTHERN_SWEDEN: Frame = { west: 10.9, east: 19.6, south: 55.2, north: 60.9, standardParallel: 58, width: 400 };

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** SVG units per degree of latitude. */
export function frameScale(frame: Frame): number {
  return frame.width / ((frame.east - frame.west) * Math.cos(toRadians(frame.standardParallel)));
}

export function frameHeight(frame: Frame): number {
  return (frame.north - frame.south) * frameScale(frame);
}

export type Point = { x: number; y: number };

/** A longitude and latitude as SVG coordinates: x to the right, y down, (0, 0) at the north-west corner. */
export function project(frame: Frame, [lon, lat]: LonLat): Point {
  const scale = frameScale(frame);
  return {
    x: (lon - frame.west) * Math.cos(toRadians(frame.standardParallel)) * scale,
    y: (frame.north - lat) * scale,
  };
}

export function inFrame(frame: Frame, [lon, lat]: LonLat): boolean {
  return lon >= frame.west && lon <= frame.east && lat >= frame.south && lat <= frame.north;
}

/** A closed ring of points as an SVG path, one decimal per coordinate. */
export function ringPath(frame: Frame, ring: readonly LonLat[]): string {
  return (
    ring
      .map((point, i) => {
        const { x, y } = project(frame, point);
        return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ") + " Z"
  );
}

// ---------------------------------------------------------------------------
// Spreading the pins of one town
// ---------------------------------------------------------------------------

/** Centre-to-centre distance between pins of the same town, in SVG units. 30 units is 26 px on a 343 px phone map. */
export const PIN_GAP = 30;

/** Distance from the town to each of its `count` pins so neighbours on the ring are `gap` apart. One pin sits on the town. */
export function ringRadius(count: number, gap: number = PIN_GAP): number {
  return count < 2 ? 0 : gap / (2 * Math.sin(Math.PI / count));
}

/**
 * Points that share a `group` (a town) are put on a ring around their common
 * spot, the first at the top and the rest clockwise, so each one can be
 * selected. A point alone in its group stays where it is. The order is kept.
 */
export function spreadPins<T extends Point & { group: string }>(points: readonly T[], gap: number = PIN_GAP): (T & { anchor: Point })[] {
  const groups = new Map<string, number>();
  for (const p of points) groups.set(p.group, (groups.get(p.group) ?? 0) + 1);
  const seen = new Map<string, number>();
  return points.map((p) => {
    const count = groups.get(p.group)!;
    const index = seen.get(p.group) ?? 0;
    seen.set(p.group, index + 1);
    const radius = ringRadius(count, gap);
    const angle = -Math.PI / 2 + (2 * Math.PI * index) / count;
    return { ...p, anchor: { x: p.x, y: p.y }, x: p.x + radius * Math.cos(angle), y: p.y + radius * Math.sin(angle) };
  });
}

// ---------------------------------------------------------------------------
// The map view
// ---------------------------------------------------------------------------

export type MapPin = {
  item: ExploreItem;
  id: string;
  title: string;
  /** An official page confirmed the facility and that outside companies can use it. */
  verified: boolean;
  town: string;
  /** Where the place came from, quoted. */
  placeSource: string;
  /** The pin, after spreading, and the town it belongs to, in SVG units. */
  x: number;
  y: number;
  anchor: Point;
};

/** Where a label's text goes: the anchor point of its baseline and which end of the text sits there. */
export type LabelSpot = { x: number; y: number; anchor: "start" | "middle" | "end" };

export type TownMark = Point & { name: string; label: LabelSpot };

export type Unplaced = { item: ExploreItem; /** A stored town that falls outside the drawn area, or null when no place is stored. */ outsideTown: string | null };

export type TestbedMap = {
  /** The drawn area; the outline must be drawn with the same frame. */
  frame: Frame;
  width: number;
  height: number;
  pins: MapPin[];
  /** Test facilities that pass the filters but have no pin. */
  unplaced: Unplaced[];
  /** The reference towns, with labels moved clear of any pins. */
  towns: TownMark[];
  /** Every stored test facility, before the tag and search filters. */
  total: number;
};

/** A town label's size at font size 13: width per character, and the box from the baseline up and down. */
export const LABEL_CHAR = 7.2;
const LABEL_ASCENT = 10;
const LABEL_DESCENT = 3;
/** No label may come closer than this to a pin's centre: the pin's button is 24 px, up to 14 units on a phone. */
export const PIN_CLEARANCE = 13;

export type Box = { left: number; right: number; top: number; bottom: number };

export function labelBox(spot: LabelSpot, text: string): Box {
  const width = text.length * LABEL_CHAR;
  const left = spot.anchor === "start" ? spot.x : spot.anchor === "end" ? spot.x - width : spot.x - width / 2;
  return { left, right: left + width, top: spot.y - LABEL_ASCENT, bottom: spot.y + LABEL_DESCENT };
}

function distanceToBox(p: Point, box: Box): number {
  return Math.hypot(Math.max(box.left - p.x, 0, p.x - box.right), Math.max(box.top - p.y, 0, p.y - box.bottom));
}

/**
 * A spot for a town's label as close to its dot as it can be: right, left,
 * below or above, inside the frame and clear of every pin. Falls back to the
 * right of the dot.
 */
export function placeLabel(town: Point & { name: string }, pins: readonly Point[], size: { width: number; height: number }): LabelSpot {
  for (let d = 6; d <= 80; d += 2) {
    const spots: LabelSpot[] = [
      { x: town.x + d, y: town.y + 4, anchor: "start" },
      { x: town.x - d, y: town.y + 4, anchor: "end" },
      { x: town.x, y: town.y + d + LABEL_ASCENT, anchor: "middle" },
      { x: town.x, y: town.y - d - LABEL_DESCENT, anchor: "middle" },
    ];
    for (const spot of spots) {
      const box = labelBox(spot, town.name);
      const inside = box.left >= 2 && box.right <= size.width - 2 && box.top >= 2 && box.bottom <= size.height - 2;
      if (inside && pins.every((p) => distanceToBox(p, box) >= PIN_CLEARANCE)) return spot;
    }
  }
  return { x: town.x + 6, y: town.y + 4, anchor: "start" };
}

/**
 * The map view: the test facilities that pass the tag and search filters, as
 * pins north to south (then by title), plus those that cannot be placed.
 * `locale` is the language of each pin's place line (C19); English when left out.
 */
export function buildTestbedMap(
  items: readonly ExploreItem[],
  filters: Pick<ExploreFilters, "tag" | "q">,
  frame: Frame = SOUTHERN_SWEDEN,
  locale: Locale = DEFAULT_LOCALE,
): TestbedMap {
  const testbeds = items.filter((i) => i.kind === "testbed");
  const shown = filterByTagAndQuery(testbeds, filters).sort((a, b) => a.title.localeCompare(b.title, "en"));

  const placed: (Point & { group: string; item: ExploreItem; town: Town; placeSource: string })[] = [];
  const unplaced: Unplaced[] = [];
  for (const item of shown) {
    const place = placeFor(item.externalId);
    const at: LonLat | null = place ? [place.town.lon, place.town.lat] : null;
    if (!place || !at || !inFrame(frame, at)) {
      unplaced.push({ item, outsideTown: place ? place.town.name : null });
      continue;
    }
    placed.push({ ...project(frame, at), group: place.town.name, item, town: place.town, placeSource: placeSourceLine(place, locale) });
  }
  placed.sort((a, b) => b.town.lat - a.town.lat || a.town.name.localeCompare(b.town.name, "en"));

  const pins = spreadPins(placed).map(
    (p): MapPin => ({
      item: p.item,
      id: p.item.id,
      title: p.item.title,
      verified: p.item.verified === true,
      town: p.town.name,
      placeSource: p.placeSource,
      x: p.x,
      y: p.y,
      anchor: p.anchor,
    }),
  );

  const size = { width: frame.width, height: frameHeight(frame) };
  const towns = Object.values(TOWNS)
    .filter((town) => inFrame(frame, [town.lon, town.lat]))
    .map((town): TownMark => {
      const at = { ...project(frame, [town.lon, town.lat]), name: town.name };
      return { ...at, label: placeLabel(at, pins, size) };
    });

  return { frame, ...size, pins, unplaced, towns, total: testbeds.length };
}
