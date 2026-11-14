import { describe, expect, it } from "vitest";
import { longDate, swedishDate, weekEnd, weekOf } from "./week";

describe("weekOf", () => {
  it("gives the Monday of the week, Monday to Sunday", () => {
    // Monday 9 November 2026 to Sunday 15 November 2026, at noon in Sweden (UTC+1).
    for (const day of ["09", "10", "11", "12", "13", "14", "15"]) {
      expect(weekOf(new Date(`2026-11-${day}T11:00:00Z`))).toBe("2026-11-09");
    }
    expect(weekOf(new Date("2026-11-16T11:00:00Z"))).toBe("2026-11-16");
  });

  it("counts the Swedish day, not the UTC day, around midnight", () => {
    // 00:30 on Monday 16 November in Sweden is still Sunday 23:30 in UTC.
    expect(weekOf(new Date("2026-11-15T23:30:00Z"))).toBe("2026-11-16");
    // 23:30 on Sunday 15 November in Sweden.
    expect(weekOf(new Date("2026-11-15T22:30:00Z"))).toBe("2026-11-09");
  });

  it("crosses a year boundary", () => {
    // Thursday 1 January 2026 belongs to the week of Monday 29 December 2025.
    expect(weekOf(new Date("2026-01-01T11:00:00Z"))).toBe("2025-12-29");
    // 23:30 on Sunday 4 January 2026 in Sweden: still that week.
    expect(weekOf(new Date("2026-01-04T22:30:00Z"))).toBe("2025-12-29");
    // 00:30 on Monday 5 January 2026 in Sweden is Sunday 23:30 UTC.
    expect(weekOf(new Date("2026-01-04T23:30:00Z"))).toBe("2026-01-05");
    // New Year's Eve 2026 in Sweden, 00:30 on 1 January 2027 there.
    expect(weekOf(new Date("2026-12-31T23:30:00Z"))).toBe("2026-12-28");
  });

  it("is not thrown by the clock change in spring", () => {
    // Summer time starts on Sunday 29 March 2026 (UTC+2 from then).
    expect(weekOf(new Date("2026-03-29T21:30:00Z"))).toBe("2026-03-23"); // Sunday 23:30 in Sweden
    expect(weekOf(new Date("2026-03-29T22:30:00Z"))).toBe("2026-03-30"); // Monday 00:30 in Sweden
  });

  it("is not thrown by the clock change in autumn", () => {
    // Summer time ends on Sunday 25 October 2026 (UTC+1 from then).
    expect(weekOf(new Date("2026-10-25T22:30:00Z"))).toBe("2026-10-19"); // Sunday 23:30 in Sweden
    expect(weekOf(new Date("2026-10-25T23:15:00Z"))).toBe("2026-10-26"); // Monday 00:15 in Sweden
    // The job's own schedule: Monday 05:00 in Sweden, on both sides of the change.
    expect(weekOf(new Date("2026-10-19T03:00:00Z"))).toBe("2026-10-19");
    expect(weekOf(new Date("2026-10-26T04:00:00Z"))).toBe("2026-10-26");
  });
});

describe("weekEnd and longDate", () => {
  it("gives the Sunday of the week, across a month and a year", () => {
    expect(weekEnd("2026-11-09")).toBe("2026-11-15");
    expect(weekEnd("2026-11-30")).toBe("2026-12-06");
    expect(weekEnd("2026-12-28")).toBe("2027-01-03");
  });

  it("writes a day the way the note does", () => {
    expect(longDate("2026-12-02")).toBe("2 December 2026");
    expect(longDate("2027-01-14")).toBe("14 January 2027");
  });
});

describe("swedishDate", () => {
  it("gives the calendar day in Sweden", () => {
    expect(swedishDate(new Date("2026-12-02T13:00:00Z"))).toBe("2026-12-02");
    expect(swedishDate(new Date("2027-01-14T22:59:00Z"))).toBe("2027-01-14");
    expect(swedishDate(new Date("2027-01-14T23:00:00Z"))).toBe("2027-01-15");
    expect(swedishDate(new Date("2026-07-01T22:30:00Z"))).toBe("2026-07-02"); // UTC+2 in summer
  });
});
