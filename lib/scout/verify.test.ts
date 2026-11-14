import { describe, expect, it } from "vitest";
import type { WriterOption } from "./prompt";
import type { SourceRecord } from "./types";
import {
  checkOption,
  checkWriterReply,
  codeSummary,
  eligibilityPhrase,
  fitSummary,
  linksIn,
  profileWords,
  reword,
  strayFacts,
  writerRetryFeedback,
  type CheckContext,
} from "./verify";

const PROFILE = [
  "EmbeddedArt",
  "Offerings: UV-sensors and technical systems for maritime surveillance, monitoring and marine measurement stations",
  "Technologies: product development, hydroacoustics, sensor systems",
  "Interests: Underwater test ranges for sensor trials in spring 2027",
].join("\n");

function source(id: string, extra: Partial<SourceRecord> = {}): SourceRecord {
  return {
    id,
    title: "The Baltic Marine Watchdog Challenge",
    url: `https://www.vinnova.se/e/${id.toLowerCase()}/`,
    snippet: "Funding for autonomous sea surveillance.",
    description: "Vinnova funds teams up to EUR 520 000 for autonomous systems for sea surveillance. Contact challenge@vinnova.se.",
    origin: "store",
    retrievedAt: "2026-11-10T03:00:00Z",
    opportunityId: null,
    kind: "funding",
    sourceName: "Vinnova",
    deadline: "2026-12-02T22:59:00Z",
    eventDate: null,
    contact: null,
    eligibilityText: null,
    page: null,
    ...extra,
  };
}

function context(sources: SourceRecord[]): CheckContext {
  return {
    sources: new Map(sources.map((s) => [s.id, s])),
    returnedUrls: new Set(sources.map((s) => s.url)),
    companyName: "EmbeddedArt",
    profileText: PROFILE,
    question: "Which funding could fit an underwater sensor we want to trial next year?",
    today: new Date("2026-11-14T10:00:00Z"),
  };
}

const option = (extra: Partial<WriterOption> = {}): WriterOption => ({
  source: "R1",
  title: "Vinnova call for marine surveillance challenges",
  whySource: "Vinnova funds teams up to EUR 520 000 for autonomous systems for sea surveillance; the call closes on 2 December 2026.",
  whyProfile: "EmbeddedArt's hydroacoustics and maritime surveillance sensors could be part of such a system.",
  requirements: ["The source does not state requirements."],
  contactRoute: "Write to challenge@vinnova.se.",
  openQuestions: ["Whether a single company may apply without a team."],
  ...extra,
});

describe("checkOption", () => {
  const ctx = context([source("R1"), source("R2")]);

  it("passes an option that only states what its source and the profile say", () => {
    expect(checkOption(option(), ctx)).toEqual([]);
  });

  it("refuses an id that was not shown, and one whose URL no tool returned", () => {
    expect(checkOption(option({ source: "R9" }), ctx)[0]).toContain("not one of the sources");
    const notReturned = { ...ctx, returnedUrls: new Set<string>() };
    expect(checkOption(option(), notReturned)[0]).toContain("was not returned by a search");
  });

  it("refuses a second option on the same source", () => {
    expect(checkOption(option(), ctx, new Set(["R1"]))[0]).toContain("already the source of an earlier option");
  });

  it("refuses eligibility words anywhere", () => {
    for (const text of ["EmbeddedArt is eligible for the call.", "The company qualifies.", "Funding is guaranteed for the trial."]) {
      expect(checkOption(option({ openQuestions: [text] }), ctx).join(" ")).toMatch(/uses "(eligib|qualif|guarantee)"/);
    }
  });

  it("refuses dates, amounts and links that are not in the source or the profile", () => {
    const problems = checkOption(
      option({ whySource: "Vinnova funds up to EUR 2 million per team; the call closes on 15 January 2027.", contactRoute: "See https://www.vinnova.se/other-page/" }),
      ctx,
    ).join(" ");
    expect(problems).toContain('"EUR 2 million"');
    expect(problems).toContain('"15 January 2027"');
    expect(problems).toContain("https://www.vinnova.se/other-page/");
  });

  it("allows the year from the profile and the date written in the source block", () => {
    expect(checkOption(option({ openQuestions: ["Whether a sea trial in spring 2027 fits the call's 2 December 2026 closing date."] }), ctx)).toEqual([]);
  });

  it("needs whyProfile to name something the profile says", () => {
    expect(checkOption(option({ whyProfile: "The company could develop solutions and products for this opportunity." }), ctx).join(" ")).toContain("names nothing the company profile says");
  });

  it("refuses ids in the text and empty requirements", () => {
    const problems = checkOption(option({ whySource: "Like R2, Vinnova funds autonomous systems for sea surveillance at sea.", requirements: [] }), ctx).join(" ");
    expect(problems).toContain("writes the ids R2");
    expect(problems).toContain('"requirements" has 0 items');
  });
});

describe("checkWriterReply", () => {
  const sources = [1, 2, 3, 4, 5, 6].map((n) => source(`R${n}`));
  const ctx = context(sources);
  const reply = (options: WriterOption[], summary = "Six Vinnova calls fund autonomous sea surveillance systems.") => JSON.stringify({ options, summary });

  it("keeps passing options, drops failing ones, and keeps the summary only when nothing failed", () => {
    const all = sources.map((s) => option({ source: s.id }));
    const good = checkWriterReply(reply(all), ctx);
    expect(good.accepted).toHaveLength(6);
    expect(good.summary).toBe("Six Vinnova calls fund autonomous sea surveillance systems.");

    const oneBad = checkWriterReply(reply([...all.slice(0, 5), option({ source: "R6", whyProfile: "EmbeddedArt is eligible and its sensor systems fit." })]), ctx);
    expect(oneBad.accepted).toHaveLength(5);
    expect(oneBad.failed[0].index).toBe(5);
    expect(oneBad.summary).toBeNull();
  });

  it("flags too few options and a summary with a fact no kept source states", () => {
    const checked = checkWriterReply(reply([option()], "One call gives EUR 9 million to sea surveillance."), ctx);
    expect(checked.problems.join(" ")).toContain("Only 1 options passed");
    expect(checked.summaryProblems.join(" ")).toContain('"EUR 9 million"');
  });

  it("fails a reply that is not JSON as a whole", () => {
    const checked = checkWriterReply("Here is the brief: ...", ctx);
    expect(checked.accepted).toEqual([]);
    expect(checked.problems[0]).toContain("not one JSON object");
  });

  it("asks again with each failed option as it was written, and the ones to keep", () => {
    const checked = checkWriterReply(reply([option(), option({ source: "R2", title: "Qualified" })]), ctx);
    const feedback = writerRetryFeedback(checked);
    expect(feedback).toContain("Option 2 (R2)");
    expect(feedback).toContain('"title":"Qualified"');
    expect(feedback).toContain("keep them as they are: R1");
  });
});

describe("wording and helpers", () => {
  it("rewords the two fixed phrases without touching real claims", () => {
    const out = reword(
      option({
        requirements: ["Vinnova may cover at most 50 percent of the project's eligible costs."],
        openQuestions: ["Whether the company's radio products qualify for the call's scope.", "Whether the sensor qualifies for funding."],
        whyProfile: "EmbeddedArt qualifies for this call.",
      }),
    );
    expect(out.requirements).toEqual(["Vinnova may cover at most 50 percent of the project's costs the call covers."]);
    expect(out.openQuestions).toEqual(["Whether the company's radio products are covered by the call's scope.", "Whether the sensor is covered by funding."]);
    expect(eligibilityPhrase(out.whyProfile)).toBe("qualif");
  });

  it("finds links and email addresses", () => {
    expect(linksIn("Write to challenge@vinnova.se or see https://www.vinnova.se/e/x/.")).toEqual(["challenge@vinnova.se", "https://www.vinnova.se/e/x/."]);
  });

  it("compares links without scheme, www or a trailing slash", () => {
    expect(strayFacts("See https://www.mtcos.se/kontakt/", "MTC contact form: https://www.mtcos.se/kontakt/ (Karlskrona)")).toEqual([]);
    expect(strayFacts("See mtcos.se/kontakt.", "MTC contact form: https://www.mtcos.se/kontakt/")).toEqual([]);
  });

  it("names the profile words whyProfile shares, ignoring generic words and the company name", () => {
    expect(profileWords("EmbeddedArt's hydroacoustics could be tested at sea.", PROFILE, "EmbeddedArt")).toEqual(["hydroacoustics"]);
    expect(profileWords("EmbeddedArt develops products and solutions.", PROFILE, "EmbeddedArt")).toEqual([]);
  });

  it("cuts a long summary at a sentence end", () => {
    const long = `${"First sentence is here. ".repeat(20)}Last.`;
    const cut = fitSummary(long, 100);
    expect(cut.length).toBeLessThanOrEqual(100);
    expect(cut.endsWith(".")).toBe(true);
    expect(fitSummary("Short.", 100)).toBe("Short.");
  });

  it("writes a plain summary from the kept options", () => {
    expect(
      codeSummary([
        { kind: "testbed", sourceName: "Curated testbed list" },
        { kind: "testbed", sourceName: "Curated testbed list" },
        { kind: "funding", sourceName: "Vinnova" },
      ]),
    ).toBe("3 options: 2 test facilities and 1 funding call, from Curated testbed list and Vinnova.");
  });
});
