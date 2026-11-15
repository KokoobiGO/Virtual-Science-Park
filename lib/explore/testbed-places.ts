/**
 * Where each stored test facility is (C15), for the explorer's map.
 *
 * The opportunities table has no location column. The places live in the
 * hand-kept testbed list, data/testbeds.seed.json: a record's `town`, `lat`
 * and `lon` come from the address the facility's own page gives, town-level
 * accuracy only. A stored testbed is looked up there by its external id (the
 * seed id). The map also quotes the record's own words that name the town, so
 * a reader can see where the place came from. A facility without a place is
 * listed under "Location not stored", never guessed.
 */
import testbedsJson from "../../data/testbeds.seed.json";
import { parseTestbeds, type TestbedRecord } from "../collectors/testbeds";
import { DEFAULT_LOCALE, type Locale } from "../i18n/config";
import { createTranslator } from "../i18n/translate";

export type Town = { name: string; lat: number; lon: number };

/** The map's labelled reference towns, at the same points the testbed list uses. */
export const TOWNS = {
  karlskrona: { name: "Karlskrona", lat: 56.1612, lon: 15.5869 },
  linkoping: { name: "Linköping", lat: 58.4108, lon: 15.6214 },
  gothenburg: { name: "Gothenburg", lat: 57.7089, lon: 11.9746 },
  stockholm: { name: "Stockholm", lat: 59.3293, lon: 18.0686 },
  malmo: { name: "Malmö", lat: 55.605, lon: 13.0038 },
} as const satisfies Record<string, Town>;

/** The record's fields, in the order they are searched for the town's name. `note` is the list's note, not stored in the database. */
export const PLACE_FIELDS = ["title", "contact", "note", "description"] as const;
export type PlaceField = (typeof PLACE_FIELDS)[number];

export type TestbedPlace = {
  town: Town;
  /** The record's own words that name the town, or null when no field names it. */
  field: PlaceField | null;
  quote: string | null;
};

/** Longest quote shown; a longer one is cut before the town, at a word, and marked with an ellipsis. */
export const MAX_QUOTE = 110;
const ELLIPSIS = "…";

/**
 * The first clause in the record that names the town: fields in PLACE_FIELDS
 * order, each split into sentences and at brackets and semicolons.
 */
export function placeQuote(record: Partial<Record<PlaceField, string>>, town: string): { field: PlaceField; quote: string } | null {
  for (const field of PLACE_FIELDS) {
    const piece = record[field]
      ?.split(/(?<=\.)\s+|[;()]/)
      .map((p) => p.trim().replace(/\.$/, ""))
      .find((p) => p.includes(town));
    if (piece) return { field, quote: shorten(piece, town) };
  }
  return null;
}

function shorten(text: string, town: string): string {
  if (text.length <= MAX_QUOTE) return text;
  const end = text.indexOf(town) + town.length;
  const start = end > MAX_QUOTE ? text.indexOf(" ", end - MAX_QUOTE) + 1 : 0;
  return `${start > 0 ? ELLIPSIS : ""}${text.slice(start, end)}${end < text.length ? ELLIPSIS : ""}`;
}

/** Every record with a place, by external id. */
export function placeIndex(records: readonly TestbedRecord[]): Map<string, TestbedPlace> {
  const index = new Map<string, TestbedPlace>();
  for (const r of records) {
    if (r.town === undefined || r.lat === undefined || r.lon === undefined) continue;
    const found = placeQuote(r, r.town);
    index.set(r.externalId, { town: { name: r.town, lat: r.lat, lon: r.lon }, field: found?.field ?? null, quote: found?.quote ?? null });
  }
  return index;
}

let seedPlaces: Map<string, TestbedPlace> | undefined;

/** The place of a stored test facility from the testbed list, or null when none is known. */
export function placeFor(externalId: string): TestbedPlace | null {
  seedPlaces ??= placeIndex(parseTestbeds(testbedsJson));
  return seedPlaces.get(externalId) ?? null;
}

/**
 * One line on where a place came from, e.g. `From the title: "…, Karlskrona".`
 * The words around the quote are in the reader's language (`explore.map.place`,
 * C19); the quote stays as stored. English when `locale` is left out.
 */
export function placeSourceLine(place: Pick<TestbedPlace, "field" | "quote">, locale: Locale = DEFAULT_LOCALE): string {
  const t = createTranslator(locale, "explore");
  return place.field && place.quote
    ? t("map.place.fromField", { field: t(`map.place.fields.${place.field}`), quote: place.quote })
    : t("map.place.fromList");
}
