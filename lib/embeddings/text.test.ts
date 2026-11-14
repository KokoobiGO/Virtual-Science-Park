import { describe, expect, it } from "vitest";
import { cutText, MAX_DESCRIPTION_CHARS, opportunityText, personalProfileText, publicProfileText, type ClaimForText, type CompanyForText } from "./text";

const company: CompanyForText = {
  name: "EmbeddedArt",
  industry: "Försvarssektorn",
  bspDescription: "Erbjuder produkter och tjänster inom försvarsområdet.",
};

const older = new Date("2026-11-01T10:00:00Z");
const newer = new Date("2026-11-10T10:00:00Z");

const claim = (overrides: Partial<ClaimForText>): ClaimForText => ({
  field: "summary",
  value: "EmbeddedArt builds sensors for maritime surveillance.",
  status: "stated",
  visibility: "public",
  reviewState: "active",
  updatedBy: "profiler",
  updatedAt: older,
  ...overrides,
});

const claims: ClaimForText[] = [
  claim({}),
  claim({ field: "technologies", value: ["Hydroacoustics", "Sensor systems"] }),
  claim({ field: "statedPriorities", value: null, status: "missing" }),
  claim({ field: "markets", value: ["Navy test ranges"], status: "user_corrected", updatedBy: "user", visibility: "private", updatedAt: newer }),
  claim({ field: "markets", value: ["Military defence"] }),
  claim({ field: "geography", value: ["Karlskrona"], reviewState: "superseded" }),
  claim({ field: "offerings", value: ["UV sensors"], reviewState: "suggested" }),
];

describe("opportunityText", () => {
  it("puts the title first, then the description", () => {
    expect(opportunityText({ title: "Marine sensors call", description: "Funding for\n\nunderwater   sensors." })).toBe(
      "Marine sensors call\nFunding for underwater sensors.",
    );
  });

  it("works without a description", () => {
    expect(opportunityText({ title: "Hackathon", description: null })).toBe("Hackathon");
  });

  it("cuts the description to about 2000 characters", () => {
    const text = opportunityText({ title: "Long call", description: "ord ".repeat(2000) });
    const description = text.split("\n")[1];
    expect(description.length).toBeLessThanOrEqual(MAX_DESCRIPTION_CHARS);
    expect(description.length).toBeGreaterThan(MAX_DESCRIPTION_CHARS - 10);
    expect(description.endsWith("ord")).toBe(true);
  });
});

describe("cutText", () => {
  it("leaves short text alone and cuts long text at a word boundary", () => {
    expect(cutText("kort text", 100)).toBe("kort text");
    expect(cutText("one two three four", 10)).toBe("one two");
    expect(cutText("abcdefghij", 4)).toBe("abcd");
  });
});

describe("publicProfileText", () => {
  const text = publicProfileText(company, claims);

  it("has the name, the industry and the active public claims as labelled lines", () => {
    expect(text).toBe(
      ["EmbeddedArt", "Industry: Försvarssektorn", "Summary: EmbeddedArt builds sensors for maritime surveillance.", "Technologies: Hydroacoustics, Sensor systems"].join("\n"),
    );
  });

  it("never contains a private claim", () => {
    expect(text).not.toContain("Navy test ranges");
  });

  it("leaves a field out when the member's own private claim is in charge of it", () => {
    // The member's private answer for markets wins, so the profiler's public one is not shown either.
    expect(text).not.toContain("Markets");
  });

  it("leaves missing, superseded and suggested claims out", () => {
    expect(text).not.toContain("Stated priorities");
    expect(text).not.toContain("Karlskrona");
    expect(text).not.toContain("UV sensors");
  });

  it("uses the member's public claim over the profiler's", () => {
    const own = claim({ field: "summary", value: "We build UV sensors.", status: "user_confirmed", updatedBy: "user", updatedAt: older });
    const shown = publicProfileText(company, [claim({ updatedAt: newer }), own]);
    expect(shown).toContain("Summary: We build UV sensors.");
    expect(shown).not.toContain("maritime surveillance");
  });

  it("falls back to BSP's description when there are no public claims", () => {
    const privateOnly = [claim({ updatedBy: "user", status: "user_corrected", visibility: "private" })];
    expect(publicProfileText(company, privateOnly)).toBe(
      "EmbeddedArt\nIndustry: Försvarssektorn\nDescription: Erbjuder produkter och tjänster inom försvarsområdet.",
    );
    expect(publicProfileText({ ...company, industry: null, bspDescription: null }, [])).toBe("EmbeddedArt");
  });

  it("cuts a long BSP description", () => {
    const shown = publicProfileText({ ...company, bspDescription: "ord ".repeat(2000) }, []);
    expect(shown.length).toBeLessThan(MAX_DESCRIPTION_CHARS + 100);
  });
});

describe("personalProfileText", () => {
  it("has the private claims and the priorities too, with the member's claim in charge", () => {
    const text = personalProfileText(company, claims, ["testing", "funding"]);
    expect(text).toContain("Markets: Navy test ranges");
    expect(text).not.toContain("Military defence");
    expect(text).toContain("Technologies: Hydroacoustics, Sensor systems");
    expect(text.split("\n").at(-1)).toBe("Priorities: testing, funding");
  });

  it("has no priorities line without priorities, and then equals the public text when nothing is private", () => {
    const publicOnly = claims.filter((c) => c.visibility === "public");
    expect(personalProfileText(company, publicOnly, [])).toBe(publicProfileText(company, publicOnly));
  });
});
