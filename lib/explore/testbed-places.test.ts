import { describe, expect, it } from "vitest";
import seed from "../../data/testbeds.seed.json";
import { parseTestbeds, type TestbedRecord } from "../collectors/testbeds";
import { inFrame, SOUTHERN_SWEDEN } from "./map";
import { MAX_QUOTE, placeFor, placeIndex, placeQuote, placeSourceLine, TOWNS } from "./testbed-places";

const records = parseTestbeds(seed);
const collected = records.filter((r) => r.linkOk);
const ELLIPSIS = "…";

function record(overrides: Partial<TestbedRecord>): TestbedRecord {
  return {
    externalId: "a-lab",
    title: "A lab",
    url: "https://example.org",
    description: "A lab for tests.",
    tags: ["sensor"],
    verified: true,
    linkOk: true,
    checkedAt: "2026-11-14",
    origin: "curated",
    ...overrides,
  };
}

describe("placeFor (the places in the testbed list)", () => {
  it("finds the town of a stored testbed by its seed id", () => {
    expect(placeFor("foi-crate")?.town).toEqual(TOWNS.linkoping);
    expect(placeFor("mtc-salto-karlskrona")?.town).toEqual(TOWNS.karlskrona);
  });

  it("returns null when no place is known, never a guess", () => {
    expect(placeFor("fixture-testbed-mtc-salto")).toBeNull();
    expect(placeFor("not-in-the-list")).toBeNull();
    expect(placeFor("toString")).toBeNull();
    expect(placeFor("__proto__")).toBeNull();
  });

  it("places every collected testbed inside the drawn area, with the record's own words for the town", () => {
    for (const r of collected) {
      const place = placeFor(r.externalId);
      if (!place) continue; // The map lists it under "Location not stored".
      expect(inFrame(SOUTHERN_SWEDEN, [place.town.lon, place.town.lat]), r.externalId).toBe(true);
      expect(place.quote, `${r.externalId}: no field names ${place.town.name}`).not.toBeNull();
      expect(place.quote!.length).toBeLessThanOrEqual(MAX_QUOTE + 2);
      expect(place.quote).toContain(place.town.name);
      for (const part of place.quote!.split(ELLIPSIS).filter(Boolean)) expect(r[place.field!], r.externalId).toContain(part);
    }
  });

  it("puts a reference town's pins on its dot", () => {
    for (const r of records) {
      const town = Object.values(TOWNS).find((t) => t.name === r.town);
      if (town) expect([r.lat, r.lon], r.externalId).toEqual([town.lat, town.lon]);
    }
  });
});

describe("placeIndex", () => {
  it("indexes only records with a town", () => {
    const index = placeIndex([
      record({ externalId: "kista-lab", title: "A lab, Kista", town: "Kista", lat: 59.4032, lon: 17.9447 }),
      record({ externalId: "nowhere-lab" }),
    ]);
    expect([...index.keys()]).toEqual(["kista-lab"]);
    expect(index.get("kista-lab")).toEqual({ town: { name: "Kista", lat: 59.4032, lon: 17.9447 }, field: "title", quote: "A lab, Kista" });
  });

  it("keeps a place whose town no field names, and says it is from the list", () => {
    const place = placeIndex([record({ town: "Ludvika", lat: 60.1496, lon: 15.1878 })]).get("a-lab")!;
    expect(place).toMatchObject({ field: null, quote: null });
    expect(placeSourceLine(place)).toBe("From the team's testbed list.");
  });
});

describe("placeQuote", () => {
  it("takes the first field that names the town, and only the clause that does", () => {
    expect(placeQuote({ title: "FMV Naval Test Ranges (Naval Test Centre, Karlskrona)" }, "Karlskrona")).toEqual({
      field: "title",
      quote: "Naval Test Centre, Karlskrona",
    });
    expect(
      placeQuote({ title: "A lab", contact: "Form: https://example.org/contact/ (Utövägen 3A, Karlskrona)", note: "In Karlskrona." }, "Karlskrona"),
    ).toEqual({ field: "contact", quote: "Utövägen 3A, Karlskrona" });
    expect(placeQuote({ title: "A lab", note: "Old link. Town from the contact page: Södra Grytsgatan 4, SE-602 33 Norrköping." }, "Norrköping")).toEqual({
      field: "note",
      quote: "Town from the contact page: Södra Grytsgatan 4, SE-602 33 Norrköping",
    });
    expect(placeQuote({ title: "A lab", description: "No town here." }, "Luleå")).toBeNull();
  });

  it("shortens a long clause around the town, at a word", () => {
    const long = `The catalogue page https://example.org/${"x".repeat(80)} also loads and gives the address Campus Gräsvik 2, Karlskrona`;
    expect(placeQuote({ note: long }, "Karlskrona")?.quote).toBe(`${ELLIPSIS}also loads and gives the address Campus Gräsvik 2, Karlskrona`);
    const early = `the main facility is in Linköping, ${"and it can be reached remotely, ".repeat(4)}too`;
    expect(placeQuote({ description: early }, "Linköping")?.quote).toBe(`the main facility is in Linköping${ELLIPSIS}`);
    expect(placeSourceLine({ field: "description", quote: "the main facility is in Linköping" })).toBe(
      'From the description: "the main facility is in Linköping".',
    );
  });
});
