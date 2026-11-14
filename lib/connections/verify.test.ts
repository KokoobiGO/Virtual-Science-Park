import { describe, expect, it } from "vitest";
import type { PublicClaim } from "./claims";
import type { JudgeAnswer } from "./judge";
import { assignShortIds } from "./prompt";
import { INTEREST_WORDS, interestWordsIn, MAX_BASIS_CHARS, verifyJudgement } from "./verify";

const claim = (id: string, companyId: string, field: PublicClaim["field"], value: string): PublicClaim => ({ id, companyId, field, value });

const pair = { companyAId: "company-a", companyBId: "company-b" };
const shown = assignShortIds(
  [claim("uuid-a1", "company-a", "offerings", "Hydrophones, Sonar systems"), claim("uuid-a2", "company-a", "markets", "Navies")],
  [claim("uuid-b1", "company-b", "summary", "Harbour Watch runs port security."), claim("uuid-b2", "company-b", "technologies", "Radar")],
);

const good: JudgeAnswer = {
  plausible: true,
  basis: "Nordsonar makes hydrophones and sonar systems for navies. Harbour Watch runs port security with radar.",
  sharedOn: ["port security", "maritime surveillance"],
  claimsA: ["C1", "C2"],
  claimsB: ["C3"],
};

const check = (answer: Partial<JudgeAnswer>, shownClaims = shown) => verifyJudgement({ ...good, ...answer }, shownClaims, pair);

describe("verifyJudgement", () => {
  it("passes a good answer and maps the cited ids back to the real claims", () => {
    const result = check({});
    expect(result).toEqual({
      ok: true,
      connection: {
        basis: good.basis,
        sharedOn: good.sharedOn,
        evidence: [
          { companyId: "company-a", claimId: "uuid-a1", field: "offerings", value: "Hydrophones, Sonar systems" },
          { companyId: "company-a", claimId: "uuid-a2", field: "markets", value: "Navies" },
          { companyId: "company-b", claimId: "uuid-b1", field: "summary", value: "Harbour Watch runs port security." },
        ],
      },
    });
  });

  it("drops a pair the judge said no to", () => {
    expect(check({ plausible: false, basis: "Both are IT consultancies." })).toMatchObject({ ok: false, check: "plausible" });
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
    expect(check({ claimsA: ["C1"], claimsB: ["C2"] }, wrong)).toMatchObject({ ok: false, check: "ids", reason: "C1 belongs to another company than A" });
  });

  it("reads ids with spaces or small letters, and counts a repeated id once", () => {
    const result = check({ claimsA: [" c1", "C1"], claimsB: ["c3"] });
    expect(result.ok && result.connection.evidence.map((e) => e.claimId)).toEqual(["uuid-a1", "uuid-b1"]);
  });

  it("needs a basis of 20 to 400 characters", () => {
    expect(check({ basis: "Too short." })).toMatchObject({ ok: false, check: "basis_length" });
    expect(check({ basis: "x".repeat(MAX_BASIS_CHARS + 1) })).toMatchObject({ ok: false, check: "basis_length" });
    expect(check({ basis: `${"x".repeat(MAX_BASIS_CHARS)}   ` }).ok).toBe(true);
  });

  it("drops a basis with an interest word", () => {
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
