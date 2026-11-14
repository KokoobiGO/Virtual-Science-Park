import { describe, expect, it } from "vitest";
import { isAllowedUrl, maxSearches, mergeWithStore, storeHit } from "./search";
import type { ScoutHit } from "./types";

describe("domain allow-list", () => {
  it("matches allowed domains and their subdomains only", () => {
    expect(isAllowedUrl("https://www.vinnova.se/x")).toBe(true);
    expect(isAllowedUrl("https://ec.europa.eu/info")).toBe(true);
    expect(isAllowedUrl("https://testandevaluation.fmv.se/about/")).toBe(true);
    expect(isAllowedUrl("https://notvinnova.se/x")).toBe(false);
    expect(isAllowedUrl("https://vinnova.se.evil.com/x")).toBe(false);
    expect(isAllowedUrl("ftp://vinnova.se/x")).toBe(false);
    expect(isAllowedUrl("not a url")).toBe(false);
  });
});

describe("mergeWithStore", () => {
  const stored = (url: string, extra: Partial<ScoutHit> = {}): ScoutHit => ({
    title: "Stored call",
    url,
    snippet: "From the store.",
    origin: "store",
    retrievedAt: "2026-11-10T03:00:00.000Z",
    opportunityId: "00000000-0000-4000-8000-000000000009",
    sourceName: "Vinnova",
    externalId: "2026-02458",
    ...extra,
  });
  const live = (url: string, extra: Partial<ScoutHit> = {}): ScoutHit => ({
    title: "Live call",
    url,
    snippet: "From the live search.",
    origin: "live",
    retrievedAt: "2026-11-14T10:00:00.000Z",
    sourceName: "Vinnova",
    liveSource: "Vinnova funding search",
    externalId: "2026-09999",
    ...extra,
  });

  it("replaces a live hit the store has by the stored hit, on the URL or on source and external id", () => {
    const sameUrl = live("https://www.vinnova.se/e/a/");
    const sameId = live("https://www.vinnova.se/e/b/", { externalId: "2026-02458" });
    const fresh = live("https://www.vinnova.se/e/c/");
    const storedA = stored("https://www.vinnova.se/e/a/", { externalId: "2026-00001" });
    // A row stored while the page list was down links to the find-funding page but keeps its diarienummer.
    const storedB = stored("https://www.vinnova.se/sok-finansiering/hitta-finansiering/");
    const merged = mergeWithStore([sameUrl, sameId, fresh], [storedA, storedB]);
    expect(merged.hits).toEqual([storedA, storedB, fresh]);
    expect(merged.inStore).toBe(2);
  });

  it("does not match an external id of another source, and lists a stored hit once", () => {
    const other = live("https://ec.europa.eu/x", { sourceName: "EU Funding & Tenders", externalId: "2026-02458" });
    expect(mergeWithStore([other], [stored("https://www.vinnova.se/e/a/")])).toEqual({ hits: [other], inStore: 0 });
    const storedA = stored("https://www.vinnova.se/e/a/");
    const twice = mergeWithStore([live("https://www.vinnova.se/e/a/"), live("https://www.vinnova.se/e/a2/", { externalId: "2026-02458" })], [storedA]);
    expect(twice).toEqual({ hits: [storedA], inStore: 2 });
  });
});

describe("store hits", () => {
  const row = {
    id: "00000000-0000-4000-8000-000000000001",
    kind: "testbed" as const,
    source: "Curated testbed list",
    title: "MTC  Saltö",
    url: "https://www.mtcos.se/x",
    description: "Sea trials.",
    deadline: null,
    eventDate: null,
    contact: null,
    eligibilityText: null,
    retrievedAt: new Date("2026-11-10T03:00:00Z"),
  };

  it("carries the data status of the row and its source (D20)", () => {
    expect(storeHit({ ...row, simulated: true, sourceState: "simulated", sourceCachedAt: null })).toMatchObject({
      title: "MTC Saltö",
      origin: "store",
      simulated: true,
      sourceState: "simulated",
      sourceCachedAt: null,
    });
    expect(storeHit({ ...row, simulated: false, sourceState: "cached", sourceCachedAt: new Date("2026-11-09T02:00:00Z") })).toMatchObject({
      simulated: false,
      sourceState: "cached",
      sourceCachedAt: "2026-11-09T02:00:00.000Z",
    });
    // A source without a status row (no left-joined row).
    expect(storeHit({ ...row, simulated: false, sourceState: null, sourceCachedAt: null }).sourceState).toBeNull();
    // The external id, so a live hit of the same call can be matched to it.
    expect(storeHit({ ...row, externalId: "2026-02458", simulated: false, sourceState: null, sourceCachedAt: null }).externalId).toBe("2026-02458");
  });
});

describe("store search helpers", () => {
  it("reads SCOUT_MAX_SEARCHES with a default of 6", () => {
    // An explicit argument: vitest loads .env.local, which may set the real variable.
    expect(maxSearches("")).toBe(6);
    expect(maxSearches("8")).toBe(8);
    expect(maxSearches("0")).toBe(6);
    expect(maxSearches("many")).toBe(6);
    expect(maxSearches("50")).toBe(6);
  });
});
