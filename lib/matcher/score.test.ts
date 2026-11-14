import { describe, expect, it } from "vitest";
import { combineScore, Match, OpportunityKind, ScoreBreakdown, UserPriority } from "../schemas";
import { PRIORITY_KINDS, kindsForPriorities, toRankedMatch, type RankingRow } from "./score";

const row = (overrides: Partial<RankingRow> = {}): RankingRow => ({
  opportunity_id: "7b0a6d1e-3f7c-4d2a-9a51-2f1f8f2c9e10",
  rank: 1,
  score: 0.701,
  similarity: 0.87,
  tag_overlap: 0.5,
  priority_boost: 1,
  urgency: 0.596,
  feedback_score: 0,
  matched_on: ["energy"],
  ...overrides,
});

describe("PRIORITY_KINDS", () => {
  it("maps every priority to an opportunity kind", () => {
    expect(Object.keys(PRIORITY_KINDS).sort()).toEqual([...UserPriority.options].sort());
    for (const kind of Object.values(PRIORITY_KINDS)) expect(OpportunityKind.options).toContain(kind);
  });

  it("uses the agreed mapping", () => {
    expect(PRIORITY_KINDS).toEqual({ funding: "funding", testing: "testbed", events: "event", partners: "event", market: "news" });
  });
});

describe("kindsForPriorities", () => {
  it("returns the boosted kinds once each", () => {
    expect(kindsForPriorities(["testing"])).toEqual(["testbed"]);
    expect(kindsForPriorities(["partners", "events"])).toEqual(["event"]);
    expect(kindsForPriorities(["funding", "market"])).toEqual(["funding", "news"]);
  });

  it("ignores nothing switched on and unknown values", () => {
    expect(kindsForPriorities([])).toEqual([]);
    expect(kindsForPriorities(["toString", "travel"])).toEqual([]);
  });
});

describe("toRankedMatch", () => {
  it("turns a SQL row into a breakdown that passes ScoreBreakdown and combineScore", () => {
    const match = toRankedMatch(row(), "personal");
    expect(match).toEqual({
      opportunityId: "7b0a6d1e-3f7c-4d2a-9a51-2f1f8f2c9e10",
      rank: 1,
      score: 0.701,
      scoreBreakdown: { similarity: 0.87, tagOverlap: 0.5, priorityBoost: 1, urgency: 0.596, feedback: 0 },
      matchedOn: ["energy"],
    });
    expect(ScoreBreakdown.parse(match.scoreBreakdown)).toEqual(match.scoreBreakdown);
    expect(combineScore(match.scoreBreakdown)).toBe(match.score);
  });

  it("gives a public row that the Match schema accepts", () => {
    const match = toRankedMatch(row({ priority_boost: 0, score: 0.551 }), "public");
    expect(combineScore(match.scoreBreakdown)).toBe(match.score);
    const parsed = Match.safeParse({
      companyId: "0ee4a9be-1eb0-418a-9e8a-9bcbd1ff5648",
      opportunityId: match.opportunityId,
      score: match.score,
      scoreBreakdown: match.scoreBreakdown,
      mode: "public",
      matchedOn: match.matchedOn,
      why: "Test.",
      nextStep: "Test.",
      uncertainties: [],
      eligibility: "potential_match",
    });
    expect(parsed.success).toBe(true);
  });

  it("refuses a public row that used private input", () => {
    expect(() => toRankedMatch(row({ priority_boost: 1 }), "public")).toThrow(/private input/);
    expect(() => toRankedMatch(row({ priority_boost: 0, feedback_score: 0.2 }), "public")).toThrow(/private input/);
  });
});
