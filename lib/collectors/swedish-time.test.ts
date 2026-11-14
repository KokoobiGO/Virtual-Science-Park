import { describe, expect, it } from "vitest";
import { endOfSwedishDay, startOfSwedishDay, stockholmOffset, toInstant, withSwedishOffset } from "./swedish-time";

const swedish = (date: Date | null) => date?.toLocaleString("sv-SE", { timeZone: "Europe/Stockholm" });

describe("Swedish time", () => {
  it("knows the winter and the summer offset", () => {
    expect(stockholmOffset(new Date("2027-01-15T12:00:00Z"))).toBe("+01:00");
    expect(stockholmOffset(new Date("2027-06-15T12:00:00Z"))).toBe("+02:00");
    expect(withSwedishOffset("2027-01-15T23:59:00")).toBe("2027-01-15T23:59:00+01:00");
    expect(withSwedishOffset("2027-06-15T23:59:00")).toBe("2027-06-15T23:59:00+02:00");
  });

  it("closes a deadline day at 23:59 Swedish time in winter and in summer", () => {
    expect(endOfSwedishDay("2027-01-15").toISOString()).toBe("2027-01-15T22:59:00.000Z");
    expect(endOfSwedishDay("2027-06-15").toISOString()).toBe("2027-06-15T21:59:00.000Z");
    expect(swedish(endOfSwedishDay("2027-06-15"))).toBe("2027-06-15 23:59:00");
  });

  it("starts a day at 00:00 Swedish time in winter and in summer", () => {
    expect(startOfSwedishDay("2027-01-15").toISOString()).toBe("2027-01-14T23:00:00.000Z");
    expect(startOfSwedishDay("2027-06-15").toISOString()).toBe("2027-06-14T22:00:00.000Z");
  });

  it("gets the days the clocks change right", () => {
    // 2027: summer time starts 28 March at 02:00 and ends 31 October at 03:00.
    expect(startOfSwedishDay("2027-03-28").toISOString()).toBe("2027-03-27T23:00:00.000Z");
    expect(endOfSwedishDay("2027-03-28").toISOString()).toBe("2027-03-28T21:59:00.000Z");
    expect(startOfSwedishDay("2027-10-31").toISOString()).toBe("2027-10-30T22:00:00.000Z");
    expect(endOfSwedishDay("2027-10-31").toISOString()).toBe("2027-10-31T22:59:00.000Z");
  });

  it("reads a collected date: days in Swedish time, date-times with their own offset", () => {
    expect(toInstant(undefined)).toBeNull();
    expect(swedish(toInstant("2027-06-15", true))).toBe("2027-06-15 23:59:00");
    expect(swedish(toInstant("2027-06-15"))).toBe("2027-06-15 00:00:00");
    expect(toInstant("2027-06-15T13:00:00+02:00")?.toISOString()).toBe("2027-06-15T11:00:00.000Z");
    expect(toInstant("2027-06-15T21:59:00.000Z", true)?.toISOString()).toBe("2027-06-15T21:59:00.000Z");
    expect(() => toInstant("soon")).toThrow(/Not a date/);
  });
});
