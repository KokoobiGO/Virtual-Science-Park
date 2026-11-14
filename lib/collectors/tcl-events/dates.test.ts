import { describe, expect, it } from "vitest";
import { findEventDate, swedishDay } from "./dates";

/** Published in early November 2026, Swedish winter time. */
const NOV = new Date("2026-11-01T09:00:00Z");

describe("findEventDate", () => {
  it("reads a Swedish date with year and kl. time", () => {
    expect(findEventDate("Välkommen den 27 november 2026 kl. 13.00 till Villa Oscar", NOV)).toBe("2026-11-27T13:00:00+01:00");
  });

  it("reads full Swedish month names", () => {
    const pub = new Date("2026-04-01T09:00:00Z");
    const cases: [string, string][] = [
      ["12 januari", "2026-01-12"],
      ["12 februari", "2026-02-12"],
      ["12 mars", "2026-03-12"],
      ["12 april", "2026-04-12"],
      ["12 maj", "2026-05-12"],
      ["12 juni", "2026-06-12"],
      ["12 juli", "2026-07-12"],
      ["12 augusti", "2026-08-12"],
      ["12 september", "2026-09-12"],
      ["12 oktober", "2026-10-12"],
      ["12 november", "2026-11-12"],
      ["12 december", "2026-12-12"],
    ];
    for (const [text, expected] of cases) expect(findEventDate(`Datum: ${text}.`, pub), text).toBe(expected);
  });

  it("reads abbreviations, with or without a dot, and a weekday in front", () => {
    expect(findEventDate("tis 2 dec", NOV)).toBe("2026-12-02");
    expect(findEventDate("ons 9 dec. kl 9", NOV)).toBe("2026-12-09T09:00:00+01:00");
    expect(findEventDate("Fre 6 feb 2027", NOV)).toBe("2027-02-06");
    expect(findEventDate("Mån 14 sept.", new Date("2026-06-01T09:00:00Z"))).toBe("2026-09-14");
    expect(findEventDate("tor 8 okt", new Date("2026-09-01T09:00:00Z"))).toBe("2026-10-08");
    expect(findEventDate("lör 3 aug", new Date("2026-06-01T09:00:00Z"))).toBe("2026-08-03");
  });

  it("reads English dates in both orders", () => {
    expect(findEventDate("Join us on April 14, 2026 , for an inspiring session", NOV)).toBe("2026-04-14");
    expect(findEventDate("Date: 2 December 2026", NOV)).toBe("2026-12-02");
    expect(findEventDate("on December 3rd at 9:30 am", NOV)).toBe("2026-12-03T09:30:00+01:00");
    expect(findEventDate("Wednesday 9 December at 1 pm", NOV)).toBe("2026-12-09T13:00:00+01:00");
  });

  it("reads numeric ISO dates, with or without a time", () => {
    expect(findEventDate("Datum: 2026-12-02", NOV)).toBe("2026-12-02");
    expect(findEventDate("2026-12-02 kl 13:00", NOV)).toBe("2026-12-02T13:00:00+01:00");
    expect(findEventDate("2026-12-02T08:30", NOV)).toBe("2026-12-02T08:30:00+01:00");
  });

  it("reads the time in the usual Swedish ways", () => {
    expect(findEventDate("3 december kl. 13.00", NOV)).toBe("2026-12-03T13:00:00+01:00");
    expect(findEventDate("3 december kl 13", NOV)).toBe("2026-12-03T13:00:00+01:00");
    expect(findEventDate("3 december klockan 9.30", NOV)).toBe("2026-12-03T09:30:00+01:00");
    expect(findEventDate("3 december 13:00-15:00", NOV)).toBe("2026-12-03T13:00:00+01:00");
    expect(findEventDate("3 december, kl. 10:30-12:30", NOV)).toBe("2026-12-03T10:30:00+01:00");
    expect(findEventDate("Datum: 12 februari Tid: 10:00–13:00", NOV)).toBe("2027-02-12T10:00:00+01:00");
  });

  it("does not read a bare number after the date as a time", () => {
    expect(findEventDate("3 december 2 platser kvar", NOV)).toBe("2026-12-03");
    expect(findEventDate("December 3 at 5 locations", NOV)).toBe("2026-12-03");
    expect(findEventDate("3 december – Ericsson", NOV)).toBe("2026-12-03");
  });

  it("uses the Swedish summer offset between the last Sundays of March and October", () => {
    expect(findEventDate("15 juni 2026 kl. 10.00", NOV)).toBe("2026-06-15T10:00:00+02:00");
    // 2026: summer time starts 29 March at 02:00 and ends 25 October at 03:00.
    expect(findEventDate("29 mars 2026 kl. 01.00", NOV)).toBe("2026-03-29T01:00:00+01:00");
    expect(findEventDate("29 mars 2026 kl. 03.00", NOV)).toBe("2026-03-29T03:00:00+02:00");
    expect(findEventDate("25 oktober 2026 kl. 02.00", NOV)).toBe("2026-10-25T02:00:00+02:00");
    expect(findEventDate("25 oktober 2026 kl. 04.00", NOV)).toBe("2026-10-25T04:00:00+01:00");
  });

  it("takes the first day of a range or a list", () => {
    expect(findEventDate("3-4 december", NOV)).toBe("2026-12-03");
    expect(findEventDate("3–4 december", NOV)).toBe("2026-12-03");
    expect(findEventDate("3 - 4 december", NOV)).toBe("2026-12-03");
    expect(findEventDate("3 och 4 december", NOV)).toBe("2026-12-03");
    expect(findEventDate("När 19–30 november 2026", NOV)).toBe("2026-11-19");
    expect(findEventDate("Datum 19, 24, 26, 30 nov Plats - Fysiskt i Karlskrona", NOV)).toBe("2026-11-19");
    expect(findEventDate("30 nov – 2 dec", NOV)).toBe("2026-11-30");
    expect(findEventDate("December 3-4, 2026", NOV)).toBe("2026-12-03");
  });

  it("takes the first date in the text", () => {
    expect(findEventDate("Höstens luncher 7 oktober, 14 oktober och 28 oktober", new Date("2026-09-29T09:00:00Z"))).toBe("2026-10-07");
    expect(findEventDate("Sista anmälningsdag 1 december. Kursen startar 2026-12-10.", NOV)).toBe("2026-12-01");
  });

  describe("without a year", () => {
    it("takes the next such date after the published date", () => {
      expect(findEventDate("15 januari", new Date("2026-11-20T09:00:00Z"))).toBe("2027-01-15");
      expect(findEventDate("7 oktober", new Date("2026-09-29T09:00:00Z"))).toBe("2026-10-07");
    });

    it("allows the date to fall a little before the published date", () => {
      // TCL's Future Lab post was published 10 March 2026 and lists its first session on 26 February.
      expect(findEventDate("26 February, 10:30-12:00 12 March", new Date("2026-03-10T08:56:20Z"))).toBe("2026-02-26T10:30:00+01:00");
      expect(findEventDate("February 26, 10:30-12 Keynote Room March 12", new Date("2026-03-13T12:38:45Z"))).toBe("2026-02-26T10:30:00+01:00");
    });

    it("puts a date far before the published date in the next year", () => {
      expect(findEventDate("12 juni", new Date("2026-11-01T09:00:00Z"))).toBe("2027-06-12");
    });

    it("skips 29 February until a leap year", () => {
      expect(findEventDate("29 februari", new Date("2026-11-01T09:00:00Z"))).toBe("2028-02-29");
    });
  });

  it("finds nothing in a text with no date", () => {
    expect(findEventDate("Två veckor, heltid. Exklusiv Sommarkurs 2026 på BTH.", NOV)).toBeUndefined();
    expect(findEventDate("4 träffar, 8 timmar. Lunch 12- 13.", NOV)).toBeUndefined();
    expect(findEventDate("Some parts may be in English.", NOV)).toBeUndefined();
    expect(findEventDate("Mer info kommer i maj 2026.", NOV)).toBeUndefined();
    expect(findEventDate("", NOV)).toBeUndefined();
  });

  it("skips a day that does not exist and keeps looking", () => {
    expect(findEventDate("31 februari, nej: 3 mars 2027", NOV)).toBe("2027-03-03");
    expect(findEventDate("2026-13-40", NOV)).toBeUndefined();
  });
});

describe("swedishDay", () => {
  it("gives the Swedish calendar day of an instant", () => {
    expect(swedishDay(new Date("2026-11-13T23:30:00Z"))).toBe("2026-11-14");
    expect(swedishDay(new Date("2026-11-13T22:30:00Z"))).toBe("2026-11-13");
    expect(swedishDay(new Date("2026-07-01T22:30:00Z"))).toBe("2026-07-02");
    expect(swedishDay(new Date("2026-07-01T21:30:00Z"))).toBe("2026-07-01");
  });
});
