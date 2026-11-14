import { describe, expect, it } from "vitest";
import {
  amountsIn,
  BODY_MAX_CHARS,
  checkNote,
  datesIn,
  numberValues,
  sentenceCount,
  PROMISE_WORDS,
  retryFeedback,
  TITLE_MAX_CHARS,
  yearsIn,
  type CheckedInput,
  type TrendDraft,
} from "./verify";

const INPUTS: CheckedInput[] = [
  {
    id: "S1",
    text: "kind: funding call\nsource: Vinnova\ntitle: The Baltic Marine Watchdog Challenge\nopens: 2026-10-08\ndeadline: 2026-12-02\ndescription: Vinnova erbjuder upp till 2 500 000 kronor per projekt för autonoma system för sjöövervakning.",
  },
  {
    id: "S2",
    text: "kind: funding call\nsource: EU Funding & Tenders\ntitle: Regional Cable Hubs\nopens: 2026-09-01\ndeadline: 2027-01-14\ndescription: The EU contribution is EUR 4 million per project for the security of undersea cables.",
  },
  {
    id: "S3",
    text: "kind: news\nsource: Blue Science Park\ntitle: Ny satsning\npublished: 2026-11-13\ndescription: Budgeten är 12,5 MSEK under 2027 och 2028.",
  },
];

const BODY =
  "Two open calls fund autonomous systems for watching the sea and the security of undersea cables. Vinnova's Baltic Marine Watchdog Challenge closes on 2 December 2026, and the EU's Regional Cable Hubs call closes on 14 January 2027. For a small company with sensors or autonomy for the sea, this is demand for products that can be tested and shown at sea.";

const note = (fields: Partial<TrendDraft> = {}): TrendDraft => ({
  title: "New money for watching the sea and undersea cables",
  body: BODY,
  sources: ["S1", "S2"],
  ...fields,
});

describe("checkNote", () => {
  it("passes a note that keeps to the rules", () => {
    expect(checkNote(note(), INPUTS)).toEqual([]);
  });

  it("rejects a cited id that is not an input", () => {
    const problems = checkNote(note({ sources: ["S1", "S2", "S9"] }), INPUTS);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("S9");
  });

  it("needs at least two different inputs", () => {
    // BODY has dates from S1 and S2, so the date check fails too when one is not cited.
    const tooFew = expect.stringContaining("at least 2");
    expect(checkNote(note({ sources: ["S1"] }), INPUTS)).toContainEqual(tooFew);
    expect(checkNote(note({ sources: ["S1", "S1"] }), INPUTS)).toContainEqual(tooFew);
    const onlyS2 =
      "The EU's Regional Cable Hubs call funds the security of undersea cables and closes on 14 January 2027. It opened on 1 September 2026. For a small company with sensors for the sea, this is demand for detection products.";
    expect(checkNote(note({ body: onlyS2, sources: ["S2", "S2"] }), INPUTS)).toEqual([tooFew]);
    // An unknown id does not count towards the two.
    expect(checkNote(note({ body: onlyS2, sources: ["S2", "S7"] }), INPUTS)).toEqual([expect.stringContaining("S7"), tooFew]);
  });

  it("reads ids the way the model may write them", () => {
    expect(checkNote(note({ sources: [" s1", "S2 "] }), INPUTS)).toEqual([]);
  });

  it("keeps the title and the body within their lengths", () => {
    expect(checkNote(note({ title: "x".repeat(TITLE_MAX_CHARS + 1) }), INPUTS)).toEqual([expect.stringContaining("title")]);
    expect(checkNote(note({ title: "Calls" }), INPUTS)).toEqual([expect.stringContaining("title")]);
    const short = "Two calls close. One on 2 December 2026. One on 14 January 2027.";
    expect(checkNote(note({ body: short }), INPUTS)).toEqual([expect.stringContaining("The body is 64 characters")]);
    // Long, in three long sentences.
    const long = BODY.replace(/\. /g, `${", and so on and so forth".repeat(20)}. `);
    expect(long.length).toBeGreaterThan(BODY_MAX_CHARS);
    expect(checkNote(note({ body: long }), INPUTS)).toEqual([expect.stringContaining(`at most ${BODY_MAX_CHARS}`)]);
  });

  it("needs three to five sentences", () => {
    const two = "Vinnova's Baltic Marine Watchdog Challenge closes on 2 December 2026 and the EU's Regional Cable Hubs call on 14 January 2027. Both fund watching the sea and the cables under it, for small companies with sensors and autonomy.";
    expect(checkNote(note({ body: two }), INPUTS)).toEqual([expect.stringContaining("The body has 2 sentences")]);
    expect(checkNote(note({ body: `${BODY} One more. And another. And a sixth.` }), INPUTS)).toEqual([expect.stringContaining("The body has 6 sentences")]);
  });

  it("counts sentences without stopping at decimals or abbreviations", () => {
    expect(sentenceCount("Up to EUR 2.5 million, e.g. for sensors. Closes on 2 December 2026. Small firms gain.")).toBe(3);
    expect(sentenceCount("")).toBe(0);
  });

  it("rejects input ids written in the text", () => {
    expect(checkNote(note({ body: `${BODY} (S1, S2)` }), INPUTS)).toEqual([expect.stringContaining("S1, S2")]);
  });

  it.each(PROMISE_WORDS)("rejects the promise word %s, in any case", (word) => {
    const body = `${BODY} Members ${word.toUpperCase()} this.`;
    expect(checkNote(note({ body }), INPUTS)).toEqual([expect.stringContaining(word)]);
  });

  it("catches promise words inside longer words and in the title", () => {
    expect(checkNote(note({ body: `${BODY} Small firms may qualify.` }), INPUTS)).toEqual([expect.stringContaining("qualif")]);
    expect(checkNote(note({ title: "Eligible firms get new sea money" }), INPUTS)).toEqual([expect.stringContaining("eligible")]);
  });

  it("rejects a year that is not in the cited inputs", () => {
    const problems = checkNote(note({ body: `${BODY} The programme runs until 2030.` }), INPUTS);
    expect(problems).toEqual([expect.stringContaining("2030")]);
  });

  it("checks years against the cited inputs only", () => {
    // 2028 is in S3, which this note does not cite.
    expect(checkNote(note({ body: `${BODY} More follows in 2028.` }), INPUTS)).toEqual([expect.stringContaining("2028")]);
    expect(checkNote(note({ body: `${BODY} More follows in 2028.`, sources: ["S1", "S2", "S3"] }), INPUTS)).toEqual([]);
  });

  it('allows "this week" only when a cited input is marked this week', () => {
    const body = `${BODY} This week sees more of the same.`;
    expect(checkNote(note({ body }), INPUTS)).toEqual([expect.stringContaining('"this week"')]);
    const inputs = [...INPUTS, { id: "S4", text: "kind: news\ntitle: Ny satsning\npublished: 13 November 2026 (this week)" }];
    expect(checkNote(note({ body, sources: ["S1", "S2", "S4"] }), inputs)).toEqual([]);
    const opened = [...INPUTS, { id: "S4", text: "kind: funding call\ntitle: Ny utlysning\nopens: 12 November 2026 (opened this week)" }];
    expect(checkNote(note({ body, sources: ["S1", "S2", "S4"] }), opened)).toEqual([]);
  });

  it('rejects a call\'s date outside this week in a sentence that says "this week"', () => {
    const inputs = [
      ...INPUTS,
      {
        id: "S4",
        text: "kind: news\nsource: Blue Science Park\ntitle: Ny science park\npublished: 13 November 2026 (this week)\ndescription: Den nya organisationen startar den 1 januari 2027.",
      },
    ];
    const sources = ["S1", "S2", "S4"];
    const wrong = `${BODY} This week, the Regional Cable Hubs call closes on 14 January 2027.`;
    expect(checkNote(note({ body: wrong, sources }), inputs)).toEqual([expect.stringContaining('"this week" next to "14 January 2027"')]);
    const right = `${BODY} Blue Science Park said this week that the new park starts on 1 January 2027.`;
    expect(checkNote(note({ body: right, sources }), inputs)).toEqual([]);
  });

  it("rejects an opening date written as a closing date, and the other way round", () => {
    // In S1, 2026-10-08 is the opening and 2026-12-02 the deadline.
    expect(checkNote(note({ body: `${BODY} The Watchdog call opens on 2 December 2026.` }), INPUTS)).toEqual([expect.stringContaining("a closing date")]);
    expect(checkNote(note({ body: `${BODY} The Watchdog call closes on 8 October 2026.` }), INPUTS)).toEqual([expect.stringContaining("an opening date")]);
    for (const fine of ["It opened on 8 October 2026.", "It is open until 2 December 2026.", "It has a deadline of 2 December 2026.", "It opened on 8 October 2026 and closes on 2 December 2026."]) {
      expect(checkNote(note({ body: `${BODY} ${fine}` }), INPUTS), fine).toEqual([]);
    }
  });

  it('says "opens" or "new" only about a call that opens this week or later', () => {
    for (const wrong of ["The Watchdog call opens for teams.", "Two new calls are out.", "The EU launched a call."]) {
      expect(checkNote(note({ body: `${BODY} ${wrong}` }), INPUTS), wrong).toEqual([expect.stringContaining("already open before this week")]);
    }
    const opening = [...INPUTS, { id: "S4", text: "kind: funding call\ntitle: Ny utlysning\nopens: 17 November 2026 (not open yet)\ndeadline: 2 December 2026" }];
    expect(checkNote(note({ body: `${BODY} A new call opens for teams.`, sources: ["S1", "S2", "S4"] }), opening)).toEqual([]);
    // No opening date: the input may say it opens now ("Nu öppnar ansökan"), so the check cannot tell.
    const undated = [...INPUTS, { id: "S4", text: "kind: funding call\ntitle: Ny utlysning\ndeadline: 2 December 2026\ndescription: Nu öppnar ansökan." }];
    expect(checkNote(note({ body: `${BODY} A third call opens for teams.`, sources: ["S1", "S2", "S4"] }), undated)).toEqual([]);
  });

  it("rejects dates the model worked out itself", () => {
    for (const phrase of ["this month", "next week", "in three weeks", "within 10 days", "within weeks", "this winter", "12 days left", "next year"]) {
      expect(checkNote(note({ body: `${BODY} One call closes ${phrase}.` }), INPUTS), phrase).toEqual([expect.stringContaining(`"${phrase}"`)]);
    }
    // A project's length, as calls put it, is not a worked-out date.
    expect(checkNote(note({ body: `${BODY} Projects run within 10 months.` }), INPUTS)).toEqual([]);
  });

  it("rejects a funder that no cited input names", () => {
    // S1 is Vinnova's, S2 the EU's: an Energimyndigheten call or EU money in a note on S1 alone is made up.
    const onlyS1 =
      "Vinnova's Baltic Marine Watchdog Challenge funds autonomous systems for watching the sea and closes on 2 December 2026. It pays for demonstrations at sea. For a small company with sensors or autonomy for the sea, this is demand for products that can be shown at sea.";
    expect(checkNote(note({ body: onlyS1, sources: ["S1", "S3"] }), INPUTS)).toEqual([]);
    expect(checkNote(note({ body: `${onlyS1} The EU adds more.`, sources: ["S1", "S3"] }), INPUTS)).toEqual([expect.stringContaining("names the EU")]);
    expect(checkNote(note({ body: `${BODY} Energimyndigheten adds more.` }), INPUTS)).toEqual([expect.stringContaining("names Energimyndigheten")]);
  });

  it('rejects a Swedish call counted among "EU calls"', () => {
    const body = `${BODY} Two EU calls stand out, one of them Vinnova's.`;
    expect(checkNote(note({ body }), INPUTS)).toEqual([expect.stringContaining('counts "EU calls"')]);
    // Naming both in one sentence is fine when the count is not "EU calls".
    expect(checkNote(note({ body: `${BODY} Two calls stand out, an EU one and Vinnova's.` }), INPUTS)).toEqual([]);
  });

  it("says which uncited input has a stray fact, so the retry can cite it", () => {
    const problems = checkNote(note({ body: `${BODY} A budget of 12,5 MSEK follows in 2028.` }), INPUTS);
    expect(problems).toHaveLength(2);
    for (const problem of problems) expect(problem).toContain("S3 has it: cite S3 as well");
  });

  it("rejects a date that is not in the cited inputs", () => {
    const problems = checkNote(note({ body: `${BODY} A third call closes on 14 February 2027.` }), INPUTS);
    expect(problems).toEqual([expect.stringContaining('"14 February 2027"')]);
    expect(checkNote(note({ body: `${BODY} More calls close in March 2027.` }), INPUTS)).toEqual([expect.stringContaining('"March 2027"')]);
  });

  it("accepts a date the cited inputs give, however it is written", () => {
    for (const date of ["2 December 2026", "2 December", "December 2, 2026", "2nd of December 2026", "January 2027", "2026-12-02"]) {
      expect(checkNote(note({ body: `${BODY} One date to note: ${date}.` }), INPUTS), date).toEqual([]);
    }
    // From a Swedish description: "startar den 1 januari 2027".
    const inputs = [...INPUTS, { id: "S4", text: "kind: news\ntitle: Ny organisation\ndescription: Den nya organisationen startar den 1 januari 2027." }];
    expect(checkNote(note({ body: `${BODY} The new organisation starts on 1 January 2027.`, sources: ["S1", "S2", "S4"] }), inputs)).toEqual([]);
  });

  it("accepts an amount the cited inputs give, however it is written", () => {
    const amounts = [
      "EUR 4 million",
      "€4m",
      "4 million euro",
      "EUR 4,000,000",
      "SEK 2.5 million",
      "2 500 000 kronor",
      "SEK 2,500,000",
      "2.5 MSEK",
    ];
    for (const amount of amounts) {
      expect(checkNote(note({ body: `${BODY} One call offers ${amount}.` }), INPUTS), amount).toEqual([]);
    }
    expect(checkNote(note({ body: `${BODY} The plan is worth SEK 12.5 million.`, sources: ["S1", "S2", "S3"] }), INPUTS)).toEqual([]);
    expect(checkNote(note({ body: `${BODY} The plan is worth SEK 12.5 million.` }), INPUTS)).toEqual([expect.stringContaining("SEK 12.5 million")]);
  });

  it("rejects an amount that is not in the cited inputs", () => {
    for (const amount of ["EUR 5 million", "SEK 3 million", "€400,000", "10 MSEK"]) {
      const problems = checkNote(note({ body: `${BODY} One call offers ${amount}.` }), INPUTS);
      expect(problems, amount).toEqual([expect.stringContaining("amount")]);
    }
  });

  it("lists every problem at once", () => {
    // Too few sources, short title, short body, one sentence, a promise word, a stray year, S1's closing date missing and a stray amount.
    const problems = checkNote({ title: "x", body: "We guarantee EUR 9 million in 2031.", sources: ["S1"] }, INPUTS);
    expect(problems).toHaveLength(8);
  });

  it("needs every cited call's closing date in the note", () => {
    // "Both close on 14 January 2027" is wrong for S1, which closes on 2 December 2026.
    const wrong =
      "Two open calls, Vinnova's Baltic Marine Watchdog Challenge and the EU's Regional Cable Hubs, both close on 14 January 2027. Both are about the sea. For a small company with sensors or autonomy for the sea, this is demand for products that can be shown at sea.";
    expect(checkNote(note({ body: wrong }), INPUTS)).toEqual([expect.stringContaining("S1 closes on 2026-12-02")]);
    // A month and year is enough.
    const monthOnly = BODY.replace("on 2 December 2026", "in December 2026");
    expect(checkNote(note({ body: monthOnly }), INPUTS)).toEqual([]);
  });
});

describe("yearsIn", () => {
  it("finds 4-digit years, once each", () => {
    expect(yearsIn("From 2026-12-02 to 2027, and again in 2027. Not 12345 or 3000.")).toEqual(["2026", "2027"]);
  });
});

describe("datesIn", () => {
  it("finds dates in English, in Swedish and as YYYY-MM-DD, each once", () => {
    const found = datesIn("Closes 2 December 2026 or December 3, 2026; opens 1 januari 2027; deadline 2027-01-14; due in February 2027.");
    expect(found.map((d) => [d.written, d.day, d.month, d.year])).toEqual([
      ["2 December 2026", 2, 12, 2026],
      ["December 3, 2026", 3, 12, 2026],
      ["1 januari 2027", 1, 1, 2027],
      ["2027-01-14", 14, 1, 2027],
      ["February 2027", null, 2, 2027],
    ]);
  });

  it("reads short month names", () => {
    expect(datesIn("Cable hubs (14 Jan), platforms (16 Feb.), Sept 3").map((d) => [d.day, d.month])).toEqual([
      [14, 1],
      [16, 2],
      [3, 9],
    ]);
    expect(datesIn("Firms may 3D print parts in 3 mar")).toEqual([expect.objectContaining({ day: 3, month: 3 })]);
  });

  it("ignores a month with neither a day nor a year", () => {
    expect(datesIn("Calls close in early February.")).toEqual([]);
  });
});

describe("amountsIn", () => {
  it("finds amounts with a currency before or after, with their scale", () => {
    const found = amountsIn("Up to EUR 2.5 million, or 500 000 kronor, or $3bn, or 5 MSEK. Not 150 nm or 40 percent or 5 more.");
    expect(found.map((a) => a.written)).toEqual(["EUR 2.5 million", "500 000 kronor", "$3bn", "5 MSEK"]);
    expect(found.map((a) => a.values)).toEqual([[2.5e6], [500_000], [3e9], [5e6]]);
  });

  it("does not count one amount twice", () => {
    expect(amountsIn("€5 million euro")).toHaveLength(1);
  });
});

describe("numberValues", () => {
  it("reads the common ways of writing a number", () => {
    expect(numberValues("2 500 000")).toEqual([2_500_000]);
    expect(numberValues("2\u{A0}500\u{202F}000")).toEqual([2_500_000]);
    expect(numberValues("2,500,000")).toEqual([2_500_000]);
    expect(numberValues("2.5")).toEqual([2.5]);
    expect(numberValues("2,5")).toEqual([2.5]);
    expect(numberValues("1.234,5")).toEqual([1234.5]);
  });

  it("keeps both readings when the notation is ambiguous", () => {
    expect(numberValues("2,500")).toEqual([2.5, 2500]);
  });
});

describe("retryFeedback", () => {
  it("lists the problems and asks again", () => {
    const text = retryFeedback(["The title is 90 characters; it must be 10 to 80."]);
    expect(text).toContain("- The title is 90 characters");
    expect(text).toContain("Write the note again");
  });
});
