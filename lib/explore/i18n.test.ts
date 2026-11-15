import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import { createTranslator } from "../i18n/translate";
import { monthLabel, shortMonthLabel } from "./dates";
import { dateLabel, DUE_OPTIONS, EXPLORE_VIEW_TITLES, NO_FILTERS, SOON_DAYS, type ExploreItem } from "./filter";
import { buildTestbedMap, SOUTHERN_SWEDEN } from "./map";
import { placeSourceLine } from "./testbed-places";

/** C19: the explorer's rules in Swedish, and the English catalogue kept equal to the English constants. */

const NOW = new Date("2026-11-14T12:00:00Z");
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

function item(overrides: Partial<ExploreItem> = {}): ExploreItem {
  return {
    id: "id-1",
    kind: "funding",
    source: "Vinnova",
    externalId: "call-1",
    title: "Call 1",
    url: "https://example.org",
    description: null,
    opensAt: null,
    deadline: null,
    eventDate: null,
    tags: [],
    simulated: false,
    verified: null,
    sourceState: "live",
    cachedAt: null,
    ...overrides,
  };
}

describe("the English catalogue matches the explorer's constants", () => {
  it("deadline options and page titles", () => {
    const t = createTranslator("en", "explore");
    for (const [value, label] of Object.entries(DUE_OPTIONS)) expect(t(`due.${value as keyof typeof DUE_OPTIONS}`, { days: SOON_DAYS })).toBe(label);
    expect(en.explore.titles).toEqual(EXPLORE_VIEW_TITLES);
  });
});

describe("dateLabel in Swedish", () => {
  it("says each date status in Swedish, with Swedish dates", () => {
    expect(dateLabel(item({ deadline: new Date("2027-12-01T22:59:00Z") }), NOW, "sv")).toBe("Sista dag 1 dec. 2027");
    expect(dateLabel(item({ kind: "event", eventDate: new Date("2026-11-18T23:00:00Z") }), NOW, "sv")).toBe("19 nov. 2026 (om 5 dagar)");
    expect(dateLabel(item({ deadline: new Date("2026-11-14T22:59:00Z") }), NOW, "sv")).toBe("Sista dag 14 nov. 2026 (i dag)");
    expect(dateLabel(item({ deadline: new Date("2026-11-15T22:59:00Z") }), NOW, "sv")).toBe("Sista dag 15 nov. 2026 (i morgon)");
    expect(dateLabel(item({ opensAt: new Date("2027-08-03T23:00:00Z"), deadline: new Date("2027-12-01T22:59:00Z") }), NOW, "sv")).toBe(
      "Öppnar 4 aug. 2027, sista dag 1 dec. 2027",
    );
    expect(dateLabel(item({ deadline: new Date("2026-11-04T22:59:00Z") }), NOW, "sv")).toBe("Stängde 4 nov. 2026");
    expect(dateLabel(item({ kind: "event", eventDate: days(-3) }), NOW, "sv")).toBe("Ägde rum 11 nov. 2026");
    expect(dateLabel(item(), NOW, "sv")).toBe("Inget datum");
  });

  it("stays English without a locale", () => {
    expect(dateLabel(item({ deadline: new Date("2026-11-15T22:59:00Z") }), NOW)).toBe("Deadline 15 Nov 2026 (tomorrow)");
    expect(dateLabel(item({ kind: "event", eventDate: days(-3) }), NOW, "en")).toBe("Took place 11 Nov 2026");
  });
});

describe("month names", () => {
  it("are Swedish, with a capital where they start a heading", () => {
    expect(monthLabel("2027-01", "sv")).toBe("Januari 2027");
    expect(shortMonthLabel("2027-01", "sv")).toBe("jan.");
    expect(shortMonthLabel("2027-05", "sv")).toBe("maj");
    expect(monthLabel("2027-01")).toBe("January 2027");
    expect(shortMonthLabel("2027-01", "en")).toBe("Jan");
  });
});

describe("where a test facility's place came from, in Swedish", () => {
  it("translates the words around the quote and keeps the quote as stored", () => {
    expect(placeSourceLine({ field: "description", quote: "the main facility is in Linköping" }, "sv")).toBe(
      "Från beskrivningen: ”the main facility is in Linköping”.",
    );
    expect(placeSourceLine({ field: "note", quote: "In Karlskrona" }, "sv")).toBe("Från teamets anteckning i listan över testbäddar: ”In Karlskrona”.");
    expect(placeSourceLine({ field: null, quote: null }, "sv")).toBe("Från teamets lista över testbäddar.");
    expect(placeSourceLine({ field: "title", quote: "Naval Test Centre, Karlskrona" })).toBe('From the title: "Naval Test Centre, Karlskrona".');
  });

  it("builds the map's place lines in the locale asked for", () => {
    const salto = item({ id: "salto", kind: "testbed", externalId: "mtc-salto-karlskrona", title: "MTC Saltö", source: "Curated testbed list" });
    const [english] = buildTestbedMap([salto], NO_FILTERS).pins;
    const [swedish] = buildTestbedMap([salto], NO_FILTERS, SOUTHERN_SWEDEN, "sv").pins;
    expect(english.placeSource).toMatch(/^From the /);
    expect(swedish.placeSource).toMatch(/^Från /);
    // The same quote from the testbed list in both.
    expect(swedish.placeSource.split("”")[1]).toBe(english.placeSource.split('"')[1]);
  });
});
