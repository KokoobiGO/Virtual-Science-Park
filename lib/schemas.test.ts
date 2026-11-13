import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import {
  AppMetadata,
  claimSchema,
  combineScore,
  Evidence,
  Match,
  SCORE_WEIGHTS,
  TextClaim,
  toPublicBreakdown,
  type Claim,
} from "./schemas";

const evidence = {
  url: "https://embeddedart.se",
  quote: "EmbeddedArt utvecklar UV-sensorer för sjöbevakning, spaning och marina mätstationer.",
  quoteLang: "sv",
  snapshotId: "0b1f8f7e-1b0a-4c0e-9a59-6a0e7d2f9d11",
  retrievedAt: "2026-11-13T09:00:00+01:00",
} as const;

describe("Claim", () => {
  it("accepts a stated claim with evidence and keeps Swedish characters", () => {
    const claim = TextClaim.parse({
      value: "Underwater sensors for maritime surveillance",
      status: "stated",
      confidence: 0.8,
      evidence: [evidence],
      updatedBy: "profiler",
    });
    expect(claim.visibility).toBe("public");
    expect(claim.evidence[0].quote).toContain("sjöbevakning");
  });

  it("rejects a stated claim without evidence", () => {
    const result = TextClaim.safeParse({
      value: "x",
      status: "stated",
      confidence: 0.8,
      evidence: [],
      updatedBy: "profiler",
    });
    expect(result.success).toBe(false);
  });

  it("lets a user correction stand without evidence", () => {
    const result = TextClaim.safeParse({
      value: "x",
      status: "user_corrected",
      confidence: 1,
      evidence: [],
      updatedBy: "user",
      visibility: "private",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a user status written by the profiler", () => {
    const result = TextClaim.safeParse({
      value: "x",
      status: "user_confirmed",
      confidence: 1,
      evidence: [],
      updatedBy: "profiler",
    });
    expect(result.success).toBe(false);
  });

  it("requires missing claims to have no value", () => {
    const base = { status: "missing", confidence: 0, evidence: [], updatedBy: "profiler" };
    expect(TextClaim.safeParse({ ...base, value: null }).success).toBe(true);
    expect(TextClaim.safeParse({ ...base, value: "guess" }).success).toBe(false);
  });

  it("rejects confidence outside 0 to 1", () => {
    const result = TextClaim.safeParse({
      value: "x",
      status: "stated",
      confidence: 1.2,
      evidence: [evidence],
      updatedBy: "profiler",
    });
    expect(result.success).toBe(false);
  });

  it("infers the same type as the hand-written Claim<T>", () => {
    expectTypeOf<z.infer<ReturnType<typeof claimSchema<z.ZodString>>>>().toEqualTypeOf<Claim<string>>();
  });
});

describe("Evidence", () => {
  it("rejects a quote that is far too long to be a short quote", () => {
    expect(Evidence.safeParse({ ...evidence, quote: "ord ".repeat(200) }).success).toBe(false);
  });
});

describe("Match", () => {
  const base = {
    companyId: "0b1f8f7e-1b0a-4c0e-9a59-6a0e7d2f9d11",
    opportunityId: "6d1b5b6e-3f7c-4b6f-8a0e-1c2d3e4f5a6b",
    score: 0.7,
    why: "Fits",
    nextStep: "Ask",
    uncertainties: [],
    eligibility: "potential_match",
  };

  it("never accepts an eligibility decision", () => {
    const breakdown = { similarity: 1, tagOverlap: 1, priorityBoost: 0, urgency: 0, feedback: 0 };
    const ok = Match.safeParse({ ...base, mode: "public", scoreBreakdown: breakdown });
    const eligible = Match.safeParse({ ...base, mode: "public", scoreBreakdown: breakdown, eligibility: "eligible" });
    expect(ok.success).toBe(true);
    expect(eligible.success).toBe(false);
  });

  it("keeps private input out of public matches", () => {
    const breakdown = { similarity: 1, tagOverlap: 1, priorityBoost: 1, urgency: 0, feedback: 0 };
    expect(Match.safeParse({ ...base, mode: "personal", scoreBreakdown: breakdown }).success).toBe(true);
    expect(Match.safeParse({ ...base, mode: "public", scoreBreakdown: breakdown }).success).toBe(false);
  });
});

describe("score", () => {
  it("uses weights that sum to 1", () => {
    const total = Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1);
  });

  it("drops priority and feedback in public mode", () => {
    const b = { similarity: 0.8, tagOverlap: 1, priorityBoost: 1, urgency: 0.5, feedback: 0.5 };
    expect(combineScore(b)).toBeCloseTo(0.45 * 0.8 + 0.2 + 0.15 + 0.05 + 0.05);
    expect(combineScore(toPublicBreakdown(b))).toBeCloseTo(0.45 * 0.8 + 0.2 + 0.05);
  });
});

describe("AppMetadata", () => {
  it("requires a company for members and none for staff", () => {
    expect(AppMetadata.safeParse({ role: "member" }).success).toBe(false);
    expect(AppMetadata.safeParse({ role: "member", company_id: base() }).success).toBe(true);
    expect(AppMetadata.safeParse({ role: "staff" }).success).toBe(true);
  });
});

function base() {
  return "0b1f8f7e-1b0a-4c0e-9a59-6a0e7d2f9d11";
}
