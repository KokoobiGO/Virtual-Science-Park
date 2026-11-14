import { describe, expect, it } from "vitest";
import { calendarHref, cardDates, formatWhen, isWebLink, isWholeDay, kindLabel, sourceLabel, weekLabel } from "./format";

describe("formatWhen", () => {
  it("shows the Swedish date and time when the source gives a time", () => {
    // 13:00 UTC is 14:00 in Swedish winter time (UTC+1).
    expect(formatWhen(new Date("2026-12-03T13:00:00Z"))).toBe("3 Dec 2026, 14:00");
    // 12:00 UTC is 14:00 in Swedish summer time (UTC+2).
    expect(formatWhen(new Date("2027-04-15T12:00:00Z"))).toBe("15 Apr 2027, 14:00");
  });

  it("shows only the day for midnight and 23:59 Swedish time", () => {
    expect(formatWhen(new Date("2026-12-03T22:59:00Z"))).toBe("3 Dec 2026"); // 23:59 CET
    expect(formatWhen(new Date("2026-11-19T23:00:00Z"))).toBe("20 Nov 2026"); // 00:00 CET, the next Swedish day
  });

  it("uses the Swedish day, not the UTC day", () => {
    expect(formatWhen(new Date("2026-12-31T23:30:00Z"))).toBe("1 Jan 2027, 00:30");
  });
});

describe("isWholeDay", () => {
  it("is true only at 00:00 and 23:59 Swedish time", () => {
    expect(isWholeDay(new Date("2026-12-03T22:59:00Z"))).toBe(true);
    expect(isWholeDay(new Date("2026-06-03T22:00:00Z"))).toBe(true); // 00:00 CEST
    expect(isWholeDay(new Date("2026-12-03T13:00:00Z"))).toBe(false);
  });
});

describe("cardDates", () => {
  const now = new Date("2026-11-14T10:00:00Z");

  it("lists the deadline and the event date that are there", () => {
    expect(cardDates({ deadline: new Date("2026-12-03T13:00:00Z"), eventDate: null }, now)).toEqual([
      { label: "Deadline", text: "3 Dec 2026, 14:00", passed: false },
    ]);
    expect(cardDates({ deadline: null, eventDate: new Date("2026-11-19T23:00:00Z") }, now)).toEqual([
      { label: "Event date", text: "20 Nov 2026", passed: false },
    ]);
    expect(cardDates({ deadline: null, eventDate: null }, now)).toEqual([]);
  });

  it("marks a date that has passed", () => {
    expect(cardDates({ deadline: new Date("2026-11-10T13:00:00Z"), eventDate: null }, now)[0].passed).toBe(true);
  });
});

describe("labels", () => {
  it("names each kind", () => {
    expect(kindLabel("funding")).toBe("Funding call");
    expect(kindLabel("testbed")).toBe("Testbed");
    expect(kindLabel("event")).toBe("Event");
  });

  it("writes the week as its Monday", () => {
    expect(weekLabel("2026-11-09")).toBe("9 Nov 2026");
  });

  it("names a source by its title, else its host", () => {
    expect(sourceLabel({ url: "https://www.vinnova.se/e/x", title: " Vinnova call " })).toBe("Vinnova call");
    expect(sourceLabel({ url: "https://www.vinnova.se/e/x" })).toBe("vinnova.se");
    expect(sourceLabel({ url: "not a url" })).toBe("not a url");
  });

  it("links only http(s) addresses", () => {
    expect(isWebLink("https://example.org/a")).toBe(true);
    expect(isWebLink("http://example.org")).toBe(true);
    expect(isWebLink("javascript:alert(1)")).toBe(false);
    expect(isWebLink("not a url")).toBe(false);
  });

  it("points the calendar link at the route handler", () => {
    expect(calendarHref("6f1c2a3e-0000-4000-8000-000000000001")).toBe("/api/calendar/6f1c2a3e-0000-4000-8000-000000000001");
  });
});
