import { describe, expect, it } from "vitest";
import type { Recorded } from "../cache";
import { FIND_FUNDING_URL, parseVinnova, swedishTime, toPlainText, type VinnovaData } from "./parse";
import recordedJson from "./recorded.json";

/**
 * Real answers recorded on 2026-11-14: the rounds from data.vinnova.se that
 * close on or after 2026-09-30 (or have no dates yet), their calls, and
 * vinnova.se's list of offers.
 */
const recorded = recordedJson as unknown as Recorded<VinnovaData>;
const NOW = new Date(recorded.recordedAt);
/** Before several of the recorded rounds opened. */
const EARLY = new Date("2026-10-05T12:00:00+02:00");

const items = parseVinnova(recorded.data, NOW);
const find = (id: string, list = items) => list.find((item) => item.externalId === id);
const closesAfter = (deadline: string | undefined, now: Date) => deadline !== undefined && new Date(deadline) > now;

describe("parseVinnova", () => {
  it("keeps the 15 public rounds that are open, each with a deadline after now", () => {
    expect(items).toHaveLength(15);
    expect(new Set(items.map((item) => item.externalId)).size).toBe(15);
    for (const item of items) {
      expect(item.kind).toBe("funding");
      expect(item.deadline).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+0[12]:00$/);
      expect(closesAfter(item.deadline, NOW)).toBe(true);
      expect(item.url).toMatch(/^https:\/\/www\.vinnova\.se\/e\//);
    }
  });

  it("maps a round with its page, dates, eligibility and contact", () => {
    const startups = find("2025-04831");
    expect(startups).toMatchObject({
      title: "Innovativa Startups 2026",
      url: "https://www.vinnova.se/e/innovativa-startups/innovativa-startups-2026/",
      publishedAt: "2026-05-05",
      opensAt: "2026-10-12T00:00:00+02:00",
      deadline: "2027-01-12T14:00:00+01:00",
      contact: "Team Startups, startups@vinnova.se",
    });
    expect(startups?.eligibilityText).toMatch(/^Svenska aktiebolag som är högst 10 år gamla/);
    expect(startups?.description).toMatch(/^Detta erbjudande riktar sig till kunskapsintensiva unga företag/);
    expect(startups?.description).toContain("Hur mycket kan ni söka? Maximalt 500 000 kr.");
  });

  it("joins each round with its call, and keeps several open rounds of one call apart", () => {
    const call = recorded.data.calls.find((c) => c.Diarienummer === "2024-04161");
    const roundIds = recorded.data.rounds.filter((r) => r.DiarienummerUtlysning === "2024-04161").map((r) => r.Diarienummer);
    const joined = items.filter((item) => roundIds.includes(item.externalId));

    expect(joined.map((item) => item.title).sort()).toEqual([
      "5G och automatisering för operativ industrinytta",
      "Cybersäkerhet, AI och resiliens",
      "Effektiv produktutveckling av cyberfysiska system, genom avancerad digitalisering",
      "Industriell flexibel energistyrning med avancerad digitalisering",
    ]);
    expect(new Set(joined.map((item) => item.url)).size).toBe(4);
    for (const item of joined) expect(item.description).toContain(toPlainText(call?.Beskrivning));
  });

  it("does not repeat a call text that is only the call's title", () => {
    expect(find("2025-04831")?.description?.split("\n\n")).not.toContain("Innovativa Startups");
  });

  it("drops closed rounds, rounds that are not public, and announced rounds without dates", () => {
    const closed = recorded.data.rounds.filter((r) => !closesAfter(swedishTime(r.Stangningsdatum), NOW));
    const hidden = recorded.data.rounds.filter((r) => r.Publik !== 1 && closesAfter(swedishTime(r.Stangningsdatum), NOW));
    expect(closed.length).toBeGreaterThan(20);
    expect(hidden.length).toBeGreaterThan(10);
    for (const round of [...closed, ...hidden]) expect(find(round.Diarienummer)).toBeUndefined();

    // ITEA Call 2026 closed on 2 November; Eurostars call 12 is only announced, with no dates.
    expect(find("2026-02377")).toBeUndefined();
    expect(recorded.data.rounds.find((r) => r.Diarienummer === "2026-02710")?.Stangningsdatum).toBeNull();
    expect(find("2026-02710")).toBeUndefined();
  });

  it("keeps an upcoming round with its opening date", () => {
    const early = parseVinnova(recorded.data, EARLY);
    const startups = find("2025-04831", early);
    expect(startups?.opensAt).toBe("2026-10-12T00:00:00+02:00");
    expect(new Date(startups!.opensAt!).getTime()).toBeGreaterThan(EARLY.getTime());
    // Open on 5 October, closed by the recording.
    expect(find("2026-02377", early)?.deadline).toBe("2026-11-02T17:00:00+01:00");
  });

  it("keeps Swedish characters intact", () => {
    expect(find("2026-01891")?.title).toBe("Cybersäkerhet, AI och resiliens");
    expect(find("2026-01806")?.title).toBe("Förberedande projekt för det EU-samfinansierade Raw Materials Partnership (RAMP)");
    expect(find("2026-03975")?.title).toBe("Europeiska samarbeten för hållbara matsystem - FutureFoodS call 3");
    const text = JSON.stringify(items);
    expect(text).not.toMatch(/Ã|Â/);
    expect(text).not.toContain(String.fromCharCode(0xfffd));
  });

  it("has no HTML tags or entities in descriptions", () => {
    for (const item of items) {
      expect(item.description).toBeTruthy();
      expect(item.description).not.toMatch(/<[a-z/!][^>]*>/i);
      expect(item.description).not.toMatch(/&[a-z]+;|&#\d+;/i);
      expect(item.description!.length).toBeLessThanOrEqual(4000);
    }
  });

  it("links to the find-funding page when vinnova.se's page list is missing", () => {
    const withoutPages = parseVinnova({ ...recorded.data, pages: [] }, NOW);
    expect(withoutPages).toHaveLength(15);
    for (const item of withoutPages) {
      expect(item.url).toBe(FIND_FUNDING_URL);
      expect(item.publishedAt).toBeUndefined();
    }
  });
});

describe("toPlainText", () => {
  it("removes tags, decodes entities and squashes whitespace", () => {
    expect(toPlainText("<p>Stöd till <b>små</b>&nbsp;företag &amp; f&ouml;reningar</p>\r\n<ul><li>Ett&#160;steg</li></ul>")).toBe(
      "Stöd till små företag & föreningar Ett steg",
    );
    expect(toPlainText(null)).toBe("");
  });
});

describe("swedishTime", () => {
  it("adds the offset Stockholm has on that day", () => {
    expect(swedishTime("2027-01-12T14:00:00")).toBe("2027-01-12T14:00:00+01:00");
    expect(swedishTime("2027-07-29T14:00:00")).toBe("2027-07-29T14:00:00+02:00");
    expect(swedishTime("2027-03-31T17:00:00")).toBe("2027-03-31T17:00:00+02:00");
  });

  it("gives undefined for a missing date and the 1900 placeholder", () => {
    expect(swedishTime(null)).toBeUndefined();
    expect(swedishTime("1900-01-01T00:00:00")).toBeUndefined();
  });
});
