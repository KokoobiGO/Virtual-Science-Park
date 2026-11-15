import { describe, expect, it } from "vitest";
import type { PublicClaim } from "./claims";
import type { JudgeAnswer } from "./judge";
import { assignOpportunityIds, assignShortIds } from "./prompt";
import { bringsFromClaims, contentWords, genericPhraseIn, INTEREST_WORDS, interestWordsIn, MAX_BASIS_CHARS, verifyJudgement } from "./verify";

const claim = (id: string, companyId: string, field: PublicClaim["field"], value: string): PublicClaim => ({ id, companyId, field, value });

const pair = { companyAId: "company-a", companyBId: "company-b" };
const shown = assignShortIds(
  [claim("uuid-a1", "company-a", "offerings", "Hydrophones, Sonar systems"), claim("uuid-a2", "company-a", "markets", "Navies")],
  [claim("uuid-b1", "company-b", "summary", "Harbour Watch runs port security."), claim("uuid-b2", "company-b", "technologies", "Radar")],
);
const opportunities = assignOpportunityIds([
  { id: "opp-1", kind: "testbed", source: "RISE", title: "Harbour sensor test bed", deadline: null, eventDate: null },
]);

const good: JudgeAnswer = {
  plausible: true,
  fit: "supplier_user",
  aBrings: "hydrophones and sonar systems",
  bBrings: "port security",
  opportunity: "",
  basis: "Nordsonar makes hydrophones and sonar systems for navies. Harbour Watch runs port security with radar, a user of such sensors.",
  firstStep: "Introduce Nordsonar to Harbour Watch with underwater sensing for port security as the topic.",
  sharedOn: ["port security", "maritime surveillance"],
  claimsA: ["C1", "C2"],
  claimsB: ["C3"],
};

const check = (answer: Partial<JudgeAnswer>, shownClaims = shown) => verifyJudgement({ ...good, ...answer }, shownClaims, pair, opportunities);

describe("verifyJudgement", () => {
  it("passes a good answer and maps the cited ids back to the real claims", () => {
    const result = check({});
    expect(result).toEqual({
      ok: true,
      connection: {
        basis: good.basis,
        firstStep: good.firstStep,
        fit: "supplier_user",
        aBrings: good.aBrings,
        bBrings: good.bBrings,
        opportunityTitle: null,
        sharedOn: good.sharedOn,
        evidence: [
          { companyId: "company-a", claimId: "uuid-a1", field: "offerings", value: "Hydrophones, Sonar systems" },
          { companyId: "company-a", claimId: "uuid-a2", field: "markets", value: "Navies" },
          { companyId: "company-b", claimId: "uuid-b1", field: "summary", value: "Harbour Watch runs port security." },
        ],
      },
    });
  });

  it("drops a pair the judge said no to, or said yes to without a fit", () => {
    expect(check({ plausible: false, basis: "Both are IT consultancies." })).toMatchObject({ ok: false, check: "plausible" });
    expect(check({ fit: "none" })).toMatchObject({ ok: false, check: "fit" });
  });

  it("needs at least one claim from each company", () => {
    expect(check({ claimsA: [] })).toMatchObject({ ok: false, check: "sides" });
    expect(check({ claimsB: [] })).toMatchObject({ ok: false, check: "sides" });
  });

  it("drops an id that was never shown", () => {
    expect(check({ claimsB: ["C3", "C9"] })).toMatchObject({ ok: false, check: "ids", reason: "C9 was not shown" });
  });

  it("drops an id cited for the wrong company", () => {
    expect(check({ claimsA: ["C1", "C4"] })).toMatchObject({ ok: false, check: "ids", reason: "C4 is a claim of B, cited for A" });
    expect(check({ claimsB: ["C2"] })).toMatchObject({ ok: false, check: "ids" });
  });

  it("drops an id whose claim belongs to another company than its side", () => {
    const wrong = assignShortIds([claim("uuid-x", "company-x", "summary", "Another company.")], shown.filter((c) => c.side === "B").map((c) => c.claim));
    expect(check({ claimsA: ["C1"], claimsB: ["C2"], aBrings: "another company" }, wrong)).toMatchObject({ ok: false, check: "ids", reason: "C1 belongs to another company than A" });
  });

  it("reads ids with spaces or small letters, and counts a repeated id once", () => {
    const result = check({ claimsA: [" c1", "C1"], claimsB: ["c3"] });
    expect(result.ok && result.connection.evidence.map((e) => e.claimId)).toEqual(["uuid-a1", "uuid-b1"]);
  });

  it("checks the cited opportunity: shown, and given for a same-opportunity fit", () => {
    expect(check({ opportunity: "O2" })).toMatchObject({ ok: false, check: "opportunity", reason: "O2 was not shown" });
    expect(check({ fit: "same_opportunity", opportunity: "" })).toMatchObject({ ok: false, check: "opportunity" });
    const result = check({ fit: "same_opportunity", opportunity: "o1" });
    expect(result.ok && result.connection.opportunityTitle).toBe("Harbour sensor test bed");
  });

  it("needs a concrete thing from each side's cited claims, not a field, and not the same thing twice", () => {
    expect(check({ aBrings: "" })).toMatchObject({ ok: false, check: "brings", reason: "nothing named for what A brings" });
    expect(check({ aBrings: "maritime technology" })).toMatchObject({ ok: false, check: "brings", reason: expect.stringContaining("a field or a broad word") });
    expect(check({ bBrings: "digitalisation and innovation services" })).toMatchObject({ ok: false, check: "brings" });
    // Radar is B's claim C4, which is not cited.
    expect(check({ bBrings: "radar" })).toMatchObject({ ok: false, check: "brings", reason: expect.stringContaining("not in B's cited claims") });
    expect(check({ bBrings: "radar", claimsB: ["C3", "C4"] }).ok).toBe(true);
    expect(check({ aBrings: "sonar systems", bBrings: "sonar systems", claimsB: ["C3"] })).toMatchObject({ ok: false, check: "brings" });
  });

  it("needs a basis of 20 to 400 characters", () => {
    expect(check({ basis: "Too short." })).toMatchObject({ ok: false, check: "basis_length" });
    expect(check({ basis: "x".repeat(MAX_BASIS_CHARS + 1) })).toMatchObject({ ok: false, check: "basis_length" });
    expect(check({ basis: `${"x".repeat(MAX_BASIS_CHARS)}   ` }).ok).toBe(true);
  });

  it("drops a basis that rests on a shared field, region or filler", () => {
    for (const basis of [
      "Nordsonar and Harbour Watch are in the same industry and sell to navies and ports.",
      "Both companies are based in Blekinge and work with ports and navies.",
      "Both companies work in the maritime sector, with sonar and port security.",
      "Sonar and port security create synergies for Nordsonar and Harbour Watch.",
      "Nordsonar and Harbour Watch could explore collaboration on port security.",
    ]) {
      expect(check({ basis })).toMatchObject({ ok: false, check: "generic" });
    }
    expect(genericPhraseIn(good.basis)).toBeNull();
    // A place named as part of what a company does is fine.
    expect(genericPhraseIn("Affärsverken runs the power grid in Karlskrona; Techinova makes grid automation.")).toBeNull();
  });

  it("needs a first step of 20 to 250 characters", () => {
    expect(check({ firstStep: "" })).toMatchObject({ ok: false, check: "first_step" });
    expect(check({ firstStep: "x".repeat(251) })).toMatchObject({ ok: false, check: "first_step" });
  });

  it("drops a basis or first step with an interest word", () => {
    for (const basis of [
      "Harbour Watch is interested in sonar from Nordsonar.",
      "Harbour Watch wants to add underwater sensing to its port security.",
      "Harbour Watch is looking for sonar suppliers for its ports.",
      "Nordsonar is seeking partners in port security.",
      "Both companies have expressed a wish to cooperate on ports.",
      "The two companies agreed to test sonar in the port.",
      "Nordsonar is open to pilots with port operators like Harbour Watch.",
    ]) {
      expect(check({ basis })).toMatchObject({ ok: false, check: "interest_words" });
    }
    expect(check({ firstStep: "Introduce the two, since Harbour Watch is keen on sonar." })).toMatchObject({ ok: false, check: "interest_words", reason: expect.stringContaining("first step") });
  });

  it("drops eligibility words and telling anyone to apply", () => {
    expect(check({ basis: "Nordsonar qualifies for the harbour call with its sonar; Harbour Watch runs port security." })).toMatchObject({ ok: false, check: "eligibility" });
    expect(check({ firstStep: "Suggest that both apply together for the harbour sensor call." })).toMatchObject({ ok: false, check: "eligibility" });
    expect(check({ firstStep: "Tell them to submit a joint proposal to the harbour call." })).toMatchObject({ ok: false, check: "eligibility" });
    expect(check({ firstStep: "Invite both to the information day on the harbour sensor test bed." }).ok).toBe(true);
  });

  it("matches interest words as whole words, ignoring case and line breaks", () => {
    expect(interestWordsIn("Harbour Watch WANTS sonar and is Looking\nfor more.")).toEqual(["wants", "looking\nfor"]);
    expect(interestWordsIn("Nordsonar sells sonar to navies; Harbour Watch runs port security.")).toEqual([]);
    // "seek" is a word in the list, "seeker" is not.
    expect(interestWordsIn("The seeker head is made in Karlskrona.")).toEqual([]);
    expect(INTEREST_WORDS).toEqual(expect.arrayContaining(["interested", "wants", "looking for", "seeking", "has expressed", "agreed"]));
  });

  it("needs 1 to 4 short labels", () => {
    expect(check({ sharedOn: [] })).toMatchObject({ ok: false, check: "labels" });
    expect(check({ sharedOn: ["  ", ""] })).toMatchObject({ ok: false, check: "labels" });
    expect(check({ sharedOn: ["a", "b", "c", "d", "e"] })).toMatchObject({ ok: false, check: "labels" });
    expect(check({ sharedOn: ["an extremely long label that is really a whole sentence about ports"] })).toMatchObject({ ok: false, check: "labels" });
    const result = check({ sharedOn: ["port security", " port  security "] });
    expect(result.ok && result.connection.sharedOn).toEqual(["port security"]);
  });
});

describe("what each side brings", () => {
  it("keeps the words that can name a thing, and acronyms", () => {
    expect(contentWords("UV sensors for marine measurement stations")).toEqual(["UV", "sensors", "measurement", "stations"]);
    expect(contentWords("maritime technology solutions")).toEqual([]);
    expect(contentWords("high-voltage cables")).toEqual(["high", "voltage", "cables"]);
  });

  it("finds a thing in the claims by its first four letters, so 'cabling' matches 'cables'", () => {
    expect(bringsFromClaims("subsea cabling", "Installs and repairs underwater cables")).toBe(true);
    expect(bringsFromClaims("UV sensors", "UV-sensors, technical systems")).toBe(true);
    expect(bringsFromClaims("grid automation", "Ferry operations, recycling")).toBe(false);
  });
});
