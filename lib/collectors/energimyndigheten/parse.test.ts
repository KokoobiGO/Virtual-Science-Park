import { describe, expect, it } from "vitest";
import type { Recorded } from "../cache";
import { msDate, parseEnergimyndigheten, type EnergimyndighetenResponse } from "./parse";
import recordedJson from "./recorded.json";

/** The real "Aktuella" list, recorded on 2026-11-14: 11 open calls. */
const recorded = recordedJson as Recorded<EnergimyndighetenResponse>;
const RECORDED_DAY = new Date("2026-11-14T17:00:00Z");

const titles = (now: Date) => parseEnergimyndigheten(recorded.data, now).map((item) => item.title);
const stockholm = (iso: string) => new Date(iso).toLocaleString("sv-SE", { timeZone: "Europe/Stockholm" });

describe("parseEnergimyndigheten on the recorded list", () => {
  const items = parseEnergimyndigheten(recorded.data, RECORDED_DAY);

  it("keeps every call that was open on the recording day", () => {
    expect(items).toHaveLength(11);
    expect(items.every((item) => item.kind === "funding")).toBe(true);
  });

  it("drops calls whose deadline has passed", () => {
    // ISIA closes 15 November 23:59; Driving Urban Transitions 17 November 13:00.
    const afterIsia = titles(new Date("2026-11-16T00:00:00Z"));
    expect(afterIsia).toHaveLength(10);
    expect(afterIsia.some((t) => t.includes("ISIA"))).toBe(false);

    const afterDut = titles(new Date("2026-11-17T12:30:00Z"));
    expect(afterDut).toHaveLength(9);
    expect(afterDut.some((t) => t.startsWith("Driving urban transitions"))).toBe(false);
    expect(afterDut).toContain("Effektiv energianvändning i bebyggelsen för ett hållbart energisystem");

    expect(titles(new Date("2027-03-01T00:00:00Z"))).toEqual([]);
  });

  it("gives every call a future deadline, read in Swedish time", () => {
    for (const item of items) {
      expect(item.deadline).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(new Date(item.deadline!).getTime()).toBeGreaterThan(RECORDED_DAY.getTime());
    }
    const dut = items.find((item) => item.title.startsWith("Driving urban transitions"))!;
    expect(stockholm(dut.deadline!)).toBe("2026-11-17 13:00:00");
  });

  it("maps one call field by field", () => {
    expect(items.find((item) => item.title === "Produktionsstöd för biogas 2027")).toEqual({
      externalId: "/utlysningar/produktionsstod-for-biogas-2027/",
      kind: "funding",
      title: "Produktionsstöd för biogas 2027",
      url: "https://www.energimyndigheten.se/utlysningar/produktionsstod-for-biogas-2027/",
      description: expect.stringMatching(/^Aktörer som producerar biogas från stallgödsel/),
      publishedAt: "2026-11-12T07:30:20.000Z",
      deadline: "2026-12-15T22:59:00.000Z",
    });
    const biogas = items.find((item) => item.title === "Produktionsstöd för biogas 2027")!;
    expect(stockholm(biogas.deadline!)).toBe("2026-12-15 23:59:00");
  });

  it("keeps Swedish characters intact", () => {
    expect(items.map((item) => item.title)).toContain("FORESTPathways \u2013 internationell utlysning för skogssektorn");
    const text = items.map((item) => `${item.title} ${item.description}`).join(" ");
    expect(text).toMatch(/[åäö]/);
    expect(text).not.toMatch(/\uFFFD|\u00C3|&[a-z]+;/);
  });

  it("has plain-text descriptions without HTML", () => {
    for (const item of items) {
      expect(item.description).toBeTruthy();
      expect(item.description).not.toMatch(/<[^>]+>/);
      expect(item.description).not.toMatch(/\s{2,}|^\s|\s$/);
      expect(item.description!.length).toBeLessThanOrEqual(4000);
    }
  });

  it("links every call with an absolute https URL on energimyndigheten.se, ids unique", () => {
    for (const item of items) {
      expect(item.url).toMatch(/^https:\/\/www\.energimyndigheten\.se\/utlysningar\/[a-z0-9-]+\/$/);
      expect(item.url.endsWith(item.externalId)).toBe(true);
    }
    expect(new Set(items.map((item) => item.externalId)).size).toBe(items.length);
  });
});

describe("parseEnergimyndigheten edge cases", () => {
  const call = (extra: object) => ({
    Headline: "Testutlysning",
    ItemUrl: "/utlysningar/test/",
    DeadlineForApplications: "/Date(1797375540000)/",
    ...extra,
  });

  it("falls back to the HTML teaser and turns it into text", () => {
    const [item] = parseEnergimyndigheten(
      { Items: [call({ IntroText: " ", IntroTextHtml: { Fragments: [{ InternalFormat: "<p>S&ouml;k st&ouml;d<br>nu.</p><p>Mer\u00A0text\u200B.</p>" }] } })] },
      RECORDED_DAY,
    );
    expect(item.description).toBe("Sök stöd nu. Mer text.");
  });

  it("leaves out calls without a deadline, a title or a page, and cuts long text", () => {
    const items = parseEnergimyndigheten(
      {
        Items: [
          call({ DeadlineForApplications: null }),
          call({ DeadlineForApplications: "/Date(-62135596800000)/" }),
          call({ Headline: "" }),
          call({ ItemUrl: null }),
          call({ IntroText: "ord ".repeat(2000) }),
        ],
      },
      RECORDED_DAY,
    );
    expect(items).toHaveLength(1);
    expect(items[0].description!.length).toBeLessThanOrEqual(4000);
    expect(items[0].description!.endsWith("\u2026")).toBe(true);
  });

  it("reads the source's deadlines as 23:59 Swedish time in winter and in summer", () => {
    // The source sends instants with the right offset: 22:59Z in winter, 21:59Z in summer
    // ("Pilot och demonstration 2026" closed 1 June 2026 at 23:59).
    expect(stockholm(msDate("/Date(1797375540000)/")!)).toBe("2026-12-15 23:59:00");
    expect(msDate("/Date(1780351140000)/")).toBe("2026-06-01T21:59:00.000Z");
    expect(stockholm(msDate("/Date(1780351140000)/")!)).toBe("2026-06-01 23:59:00");

    const summer = { Items: [call({ DeadlineForApplications: "/Date(1780351140000)/" })] };
    expect(parseEnergimyndigheten(summer, new Date("2026-06-01T21:30:00Z"))).toHaveLength(1);
    expect(parseEnergimyndigheten(summer, new Date("2026-06-01T22:00:00Z"))).toEqual([]);
  });

  it("reads dates with or without an offset", () => {
    expect(msDate("/Date(1797375540000)/")).toBe("2026-12-15T22:59:00.000Z");
    expect(msDate("/Date(1797375540000+0100)/")).toBe("2026-12-15T22:59:00.000Z");
    expect(msDate("15 december 2026")).toBeUndefined();
    expect(msDate(undefined)).toBeUndefined();
  });
});
