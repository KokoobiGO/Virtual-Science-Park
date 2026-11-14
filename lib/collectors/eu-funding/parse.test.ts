import { describe, expect, it } from "vitest";
import type { Recorded } from "../cache";
import { EU_STATUS, type EuSearchHit } from "./api";
import { MAX_TOPICS, parseEuFunding, toPlainText } from "./parse";
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
