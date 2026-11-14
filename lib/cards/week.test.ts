import { describe, expect, it } from "vitest";
import { mondayOf, swedishDate } from "./week";

describe("mondayOf", () => {
  it("is the same day on a Monday and the Monday before on other days", () => {
    expect(mondayOf(new Date("2026-11-09T10:00:00Z"))).toBe("2026-11-09"); // Monday
    expect(mondayOf(new Date("2026-11-14T10:00:00Z"))).toBe("2026-11-09"); // Saturday
    expect(mondayOf(new Date("2026-11-15T10:00:00Z"))).toBe("2026-11-09"); // Sunday
  });

  it("goes back across a year boundary", () => {
    expect(mondayOf(new Date("2027-01-01T12:00:00Z"))).toBe("2026-12-28"); // Friday 1 January
    expect(mondayOf(new Date("2027-01-03T22:00:00Z"))).toBe("2026-12-28"); // Sunday 23:00 in Sweden
    expect(mondayOf(new Date("2027-01-03T23:30:00Z"))).toBe("2027-01-04"); // already Monday 00:30 in Sweden
  });

  it("uses the Swedish day, not the UTC day", () => {
    // Sunday 23:30 UTC in winter is Monday 00:30 in Sweden (UTC+1).
    expect(mondayOf(new Date("2026-11-15T23:30:00Z"))).toBe("2026-11-16");
    // Sunday 22:30 UTC in summer is Monday 00:30 in Sweden (UTC+2).
    expect(mondayOf(new Date("2026-06-14T22:30:00Z"))).toBe("2026-06-15");
    expect(mondayOf(new Date("2026-06-14T21:30:00Z"))).toBe("2026-06-08");
  });

  it("is right across the daylight-saving changes", () => {
    // Summer time starts on Sunday 29 March 2026 at 02:00 (01:00 UTC).
    expect(mondayOf(new Date("2026-03-29T00:30:00Z"))).toBe("2026-03-23"); // Sunday 01:30 CET
    expect(mondayOf(new Date("2026-03-29T21:59:00Z"))).toBe("2026-03-23"); // Sunday 23:59 CEST
    expect(mondayOf(new Date("2026-03-29T22:00:00Z"))).toBe("2026-03-30"); // Monday 00:00 CEST
    // Summer time ends on Sunday 25 October 2026 at 03:00 (01:00 UTC).
    expect(mondayOf(new Date("2026-10-25T22:59:00Z"))).toBe("2026-10-19"); // Sunday 23:59 CET
    expect(mondayOf(new Date("2026-10-25T23:00:00Z"))).toBe("2026-10-26"); // Monday 00:00 CET
    expect(mondayOf(new Date("2026-10-26T05:00:00Z"))).toBe("2026-10-26"); // the cron's Monday 06:00 CET
  });

  it("writes the day as YYYY-MM-DD", () => {
    expect(swedishDate(new Date("2026-03-01T12:00:00Z"))).toBe("2026-03-01");
  });
});
