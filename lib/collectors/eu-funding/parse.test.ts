import { describe, expect, it } from "vitest";
import type { Recorded } from "../cache";
import { toInstant } from "../swedish-time";
import { EU_STATUS, type EuSearchHit } from "./api";
import { MAX_TOPICS, parseEuFunding, toPlainText } from "./parse";
import recordedLookup from "./recorded-lookup.json";
import recordedJson from "./recorded.json";

const recorded: Recorded<EuSearchHit[]> = recordedJson;
const hits = recorded.data;
const now = new Date(recorded.recordedAt);
const today = recorded.recordedAt.slice(0, 10);
const items = parseEuFunding(hits, now);
const idOf = (hit: EuSearchHit) => hit.metadata.identifier?.[0] ?? "";
const daysOf = (hit: EuSearchHit) => (hit.metadata.deadlineDate ?? []).map((date) => date.slice(0, 10)).sort();

describe("parseEuFunding on the recorded response", () => {
  it("keeps one item per topic", () => {
    const rawIds = hits.map(idOf);
    expect(new Set(rawIds).size).toBeLessThan(rawIds.length); // the searches overlap
    expect(new Set(items.map((item) => item.externalId)).size).toBe(items.length);
    expect(items.length).toBeGreaterThan(100);
    expect(items.length).toBeLessThanOrEqual(MAX_TOPICS);
  });

  it("gives every item a deadline or an opening date, as calendar days", () => {
    for (const item of items) {
      expect(item.kind).toBe("funding");
      expect(item.deadline ?? item.opensAt).toBeDefined();
      for (const day of [item.deadline, item.opensAt]) if (day) expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (item.deadline) expect(item.deadline >= today).toBe(true);
    }
  });

  it("uses the next cut-off that has not passed", () => {
    const multi = hits.filter((hit) => daysOf(hit).length > 1);
    expect(multi.some((hit) => daysOf(hit)[0] < today)).toBe(true); // one has a cut-off behind it
    for (const hit of multi) {
      const item = items.find((i) => i.externalId === idOf(hit));
      expect(item?.deadline).toBe(daysOf(hit).find((day) => day >= today));
    }
  });

  it("drops topics whose last cut-off has passed", () => {
    const later = new Date("2027-03-01T12:00:00Z");
    const laterIds = new Set(parseEuFunding(hits, later).map((item) => item.externalId));
    const closed = hits.filter((hit) => daysOf(hit).every((day) => day < "2027-03-01"));
    expect(closed.length).toBeGreaterThan(10);
    for (const hit of closed) expect(laterIds.has(idOf(hit))).toBe(false);
  });

  it("drops withdrawn topics", () => {
    const cancelled = hits.map(idOf).filter((id) => id.endsWith("-CANCELLED"));
    expect(cancelled.length).toBeGreaterThan(0);
    for (const id of cancelled) expect(items.some((item) => item.externalId === id)).toBe(false);
  });

  it("links every item to its topic page on the portal", () => {
    for (const item of items) {
      expect(new URL(item.url).protocol).toBe("https:");
      expect(item.url).toBe(`https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/${item.externalId}`);
    }
  });

  it("keeps a two-stage suffix in the link", () => {
    const twoStage = items.filter((item) => /two-stage/i.test(item.externalId));
    expect(twoStage.length).toBeGreaterThan(0);
    for (const item of twoStage) expect(item.url.endsWith(`/topic-details/${item.externalId}`)).toBe(true);
  });

  it("writes descriptions as plain text", () => {
    const described = items.filter((item) => item.description);
    expect(described.length).toBeGreaterThan(items.length * 0.9);
    for (const { description = "" } of described) {
      expect(description).not.toMatch(/<\/?[a-z][^>]*>/i);
      expect(description).not.toMatch(/&(#\d+|[a-z]+);/i);
      expect(description).not.toMatch(/\s{2}/);
      expect(description.length).toBeLessThanOrEqual(4000);
    }
  });

  it("puts the nearest deadline first and honours the limit", () => {
    const deadlines = items.map((item) => item.deadline ?? "9999-12-31");
    expect(deadlines).toEqual([...deadlines].sort());
    expect(parseEuFunding(hits, now, 10)).toEqual(items.slice(0, 10));
  });
});

describe("parseEuFunding links on a recorded identifier lookup", () => {
  // The API's full hits, with its own `url` and `esST_URL` fields kept.
  type FullHit = EuSearchHit & { url: string; metadata: { url?: string[]; esST_URL?: string[]; deadlineModel?: string[] } };
  const lookupHits = recordedLookup.response.results as FullHit[];
  const lookupItems = parseEuFunding(lookupHits, new Date(recordedLookup.recordedAt));
  const itemFor = (id: string) => lookupItems.find((item) => item.externalId === id);

  it("gives each topic the link the API itself names", () => {
    expect(lookupItems).toHaveLength(lookupHits.length);
    for (const hit of lookupHits) {
      const item = itemFor(idOf(hit));
      expect(item?.url).toBe(hit.url);
      expect(item?.url).toBe(hit.metadata.url?.[0]);
      expect(item?.url).toBe(hit.metadata.esST_URL?.[0]);
    }
  });

  it("links a two-stage topic to its own page, not to the single-stage topic without the suffix", () => {
    const twoStage = lookupHits.find((hit) => idOf(hit) === "HORIZON-CL6-2027-01-CIRCBIO-01-two-stage")!;
    const singleStage = lookupHits.find((hit) => idOf(hit) === "HORIZON-CL6-2027-01-CIRCBIO-01")!;
    expect(twoStage.metadata.deadlineModel).toEqual(["two-stage"]);
    expect(singleStage.metadata.deadlineModel).toEqual(["single-stage"]);
    expect(twoStage.metadata.title).not.toEqual(singleStage.metadata.title);
    expect(itemFor(idOf(twoStage))?.url).toMatch(/\/topic-details\/HORIZON-CL6-2027-01-CIRCBIO-01-two-stage$/);
    expect(itemFor(idOf(singleStage))?.url).toMatch(/\/topic-details\/HORIZON-CL6-2027-01-CIRCBIO-01$/);
    expect(itemFor("HORIZON-CL5-2027-04-Two-Stage-D2-07")?.url).toMatch(/\/topic-details\/HORIZON-CL5-2027-04-Two-Stage-D2-07$/);
  });
});

describe("parseEuFunding rules", () => {
  const hit = (metadata: EuSearchHit["metadata"]): EuSearchHit => ({ metadata: { identifier: ["T-1"], title: ["A topic"], ...metadata } });
  const at = new Date("2026-11-14T12:00:00Z");

  it("keeps a forthcoming topic with no deadline yet only while its opening date is ahead", () => {
    const forthcoming = { status: [EU_STATUS.forthcoming] };
    expect(parseEuFunding([hit({ ...forthcoming, startDate: ["2027-01-10T00:00:00.000+0000"] })], at)).toEqual([
      { externalId: "T-1", kind: "funding", title: "A topic", url: expect.stringMatching(/\/topic-details\/T-1$/), opensAt: "2027-01-10" },
    ]);
    expect(parseEuFunding([hit({ ...forthcoming, startDate: ["2026-10-01T00:00:00.000+0000"] })], at)).toEqual([]);
    expect(parseEuFunding([hit({ status: [EU_STATUS.open], startDate: ["2027-01-10T00:00:00.000+0000"] })], at)).toEqual([]);
  });

  it("keeps a deadline that falls today", () => {
    const [item] = parseEuFunding([hit({ deadlineDate: ["2026-11-14T00:00:00.000+0000"] })], at);
    expect(item.deadline).toBe("2026-11-14");
  });

  it("closes a deadline day at 23:59 Swedish time, in winter and in summer", () => {
    const winter = [hit({ deadlineDate: ["2027-01-15T00:00:00.000+0000"] })];
    expect(parseEuFunding(winter, new Date("2027-01-15T22:30:00Z"))).toHaveLength(1); // 23:30 CET
    expect(parseEuFunding(winter, new Date("2027-01-15T23:00:00Z"))).toEqual([]); // 00:00 CET on the 16th
    const summer = [hit({ deadlineDate: ["2027-06-15T00:00:00.000+0000"] })];
    expect(parseEuFunding(summer, new Date("2027-06-15T21:30:00Z"))).toHaveLength(1); // 23:30 CEST
    expect(parseEuFunding(summer, new Date("2027-06-15T22:30:00Z"))).toEqual([]); // 00:30 CEST on the 16th
  });

  it("stores the deadline day as 23:59 Swedish time, in winter and in summer", () => {
    const [winter] = parseEuFunding([hit({ deadlineDate: ["2027-01-15T00:00:00.000+0000"] })], at);
    const [summer] = parseEuFunding([hit({ deadlineDate: ["2027-06-15T00:00:00.000+0000"] })], at);
    expect(toInstant(winter.deadline, true)?.toISOString()).toBe("2027-01-15T22:59:00.000Z");
    expect(toInstant(summer.deadline, true)?.toISOString()).toBe("2027-06-15T21:59:00.000Z");
  });

  it("cuts a long description at a word, at most 4000 characters", () => {
    const html = `<p>${"word ".repeat(2000)}</p>`;
    const [item] = parseEuFunding([hit({ deadlineDate: ["2027-01-01T00:00:00.000+0000"], descriptionByte: [html] })], at);
    expect(item.description?.length).toBeLessThanOrEqual(4000);
    expect(item.description).toMatch(/word…$/);
  });
});

describe("toPlainText", () => {
  it("turns block tags into spaces and decodes entities", () => {
    expect(toPlainText('<p class="x">Expected&nbsp;Outcome:</p><ul><li>One &amp; two</li><li>Three</li></ul><p>Fin<br>al</p>')).toBe(
      "Expected Outcome: One & two Three Fin al",
    );
  });

  it("drops a tag cut off at the end", () => {
    expect(toPlainText("<p>Scope:</p><p cla")).toBe("Scope:");
  });
});
