import { describe, expect, it } from "vitest";
import { buildIcs, escapeText, foldLine, icsFileName, utcStamp, type CalendarItem } from "./ics";

const now = new Date("2026-11-14T10:00:00Z");

const item = (over: Partial<CalendarItem> = {}): CalendarItem => ({
  opportunityId: "6f1c2a3e-0000-4000-8000-000000000001",
  kind: "funding",
  title: "Hållbar sjöfart, steg 2",
  url: "https://www.vinnova.se/e/hallbar-sjofart/",
  source: "Vinnova",
  deadline: null,
  eventDate: null,
  ...over,
});

/** The file's logical lines: folded lines joined again. */
const unfold = (ics: string) => ics.replace(/\r\n /g, "").split("\r\n");

describe("buildIcs", () => {
  it("is null without a deadline or an event date", () => {
    expect(buildIcs(item(), { now })).toBeNull();
  });

  it("writes a timed deadline in UTC, 30 minutes long", () => {
    const ics = buildIcs(item({ deadline: new Date("2026-12-03T13:00:00Z") }), { now })!;
    const lines = unfold(ics);
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines).toContain("VERSION:2.0");
    expect(lines).toContain("BEGIN:VEVENT");
    expect(lines).toContain("UID:6f1c2a3e-0000-4000-8000-000000000001-deadline@virtual-science-park");
    expect(lines).toContain("DTSTAMP:20261114T100000Z");
    expect(lines).toContain("DTSTART:20261203T130000Z");
    expect(lines).toContain("DTEND:20261203T133000Z");
    expect(lines).toContain("SUMMARY:Deadline: Hållbar sjöfart\\, steg 2");
    expect(lines).toContain("URL:https://www.vinnova.se/e/hallbar-sjofart/");
    expect(lines.filter((l) => l === "BEGIN:VEVENT")).toHaveLength(1);
    expect(lines.at(-2)).toBe("END:VCALENDAR");
    expect(lines.at(-1)).toBe(""); // the file ends with CRLF
  });

  it("writes a deadline at 23:59 Swedish time as an all-day entry on that Swedish day", () => {
    const lines = unfold(buildIcs(item({ deadline: new Date("2026-12-03T22:59:00Z") }), { now })!);
    expect(lines).toContain("DTSTART;VALUE=DATE:20261203");
    expect(lines).toContain("DTEND;VALUE=DATE:20261204");
  });

  it("writes an event at Swedish midnight as an all-day entry, across a month end", () => {
    // 23:00 UTC on 30 November is 00:00 on 1 December in Sweden.
    const lines = unfold(buildIcs(item({ kind: "event", title: "Ocean Tech Day", deadline: null, eventDate: new Date("2026-11-30T23:00:00Z") }), { now })!);
    expect(lines).toContain("UID:6f1c2a3e-0000-4000-8000-000000000001-event@virtual-science-park");
    expect(lines).toContain("SUMMARY:Ocean Tech Day");
    expect(lines).toContain("DTSTART;VALUE=DATE:20261201");
    expect(lines).toContain("DTEND;VALUE=DATE:20261202");
  });

  it("writes a timed event an hour long, and both entries when there are both dates", () => {
    const lines = unfold(
      buildIcs(item({ kind: "event", deadline: new Date("2026-11-20T10:00:00Z"), eventDate: new Date("2026-11-26T08:30:00Z") }), { now })!,
    );
    expect(lines.filter((l) => l === "BEGIN:VEVENT")).toHaveLength(2);
    expect(lines).toContain("DTSTART:20261126T083000Z");
    expect(lines).toContain("DTEND:20261126T093000Z");
  });

  it("says it is a potential match and to check the source, with the link", () => {
    const lines = unfold(buildIcs(item({ deadline: new Date("2026-12-03T13:00:00Z") }), { now })!);
    const description = lines.find((l) => l.startsWith("DESCRIPTION:"))!;
    expect(description).toContain("potential match");
    expect(description).toContain("Check the deadline on the source");
    expect(description).toContain("\\nhttps://www.vinnova.se/e/hallbar-sjofart/");
    expect(description).not.toMatch(/eligible/i);
  });

  it("leaves out a URL that is not a web link", () => {
    const lines = unfold(buildIcs(item({ url: "javascript:alert(1)", deadline: new Date("2026-12-03T13:00:00Z") }), { now })!);
    expect(lines.some((l) => l.startsWith("URL:"))).toBe(false);
  });

  it("keeps every physical line within 75 octets and joins lines with CRLF", () => {
    const ics = buildIcs(item({ title: "Långt namn på en utlysning ".repeat(8), deadline: new Date("2026-12-03T13:00:00Z") }), { now })!;
    const encoder = new TextEncoder();
    for (const line of ics.split("\r\n")) expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });
});

describe("escapeText", () => {
  it("escapes backslashes, semicolons, commas and line breaks", () => {
    expect(escapeText("a\\b;c,d\ne\r\nf")).toBe("a\\\\b\\;c\\,d\\ne\\nf");
  });
});

describe("foldLine", () => {
  it("leaves a short line alone", () => {
    expect(foldLine("SUMMARY:short")).toBe("SUMMARY:short");
  });

  it("folds at 75 octets without splitting a character", () => {
    const line = `SUMMARY:${"å".repeat(60)}`; // 8 + 120 octets
    const folded = foldLine(line);
    const parts = folded.split("\r\n ");
    const encoder = new TextEncoder();
    expect(encoder.encode(parts[0]).length).toBeLessThanOrEqual(75);
    for (const part of parts.slice(1)) expect(encoder.encode(part).length).toBeLessThanOrEqual(74);
    expect(parts.join("")).toBe(line);
  });
});

describe("utcStamp", () => {
  it("writes the UTC form", () => {
    expect(utcStamp(new Date("2026-12-03T13:05:09.123Z"))).toBe("20261203T130509Z");
  });
});

describe("icsFileName", () => {
  it("makes a plain ASCII name from the title", () => {
    expect(icsFileName("Hållbar sjöfart, steg 2")).toBe("hallbar-sjofart-steg-2.ics");
    expect(icsFileName("!!!")).toBe("opportunity.ics");
    expect(icsFileName("x".repeat(100))).toBe(`${"x".repeat(60)}.ics`);
  });
});
