import { describe, expect, it } from "vitest";
import { hasPrivateData, planPersonal } from "./personal";
import type { Judgement } from "./verify";

const kept: Judgement = { rejected: false, why: "Why text.", nextStep: "Next step.", uncertainties: ["Who may apply"], rejectionReason: null };
const rejected: Judgement = { rejected: true, why: null, nextStep: null, uncertainties: [], rejectionReason: "A different field." };

const rows = [
  { matchId: "p1", opportunityId: "o1" },
  { matchId: "p2", opportunityId: "o2" },
  { matchId: "p3", opportunityId: "o3" },
];

describe("hasPrivateData", () => {
  it("is true with an active private claim or a priority", () => {
    expect(hasPrivateData({ privateActiveClaims: 1, priorities: [] })).toBe(true);
    expect(hasPrivateData({ privateActiveClaims: 0, priorities: ["testing"] })).toBe(true);
  });

  it("is false with neither", () => {
    expect(hasPrivateData({ privateActiveClaims: 0, priorities: [] })).toBe(false);
  });
});

describe("planPersonal", () => {
  const publicJudgements = new Map([
    ["o1", kept],
    ["o2", rejected],
  ]);

  it("copies the public judgement for the same opportunity when the company has no private data", () => {
    const plan = planPersonal({ privateData: false, rows, publicJudgements });
    expect(plan.copies).toEqual([
      { matchId: "p1", opportunityId: "o1", judgement: kept },
      { matchId: "p2", opportunityId: "o2", judgement: rejected },
    ]);
    // No public judgement for o3 yet: the model judges it.
    expect(plan.toJudge).toEqual([rows[2]]);
  });

  it("copies are independent of the public judgement", () => {
    const plan = planPersonal({ privateData: false, rows, publicJudgements });
    plan.copies[0].judgement.uncertainties.push("changed");
    expect(kept.uncertainties).toEqual(["Who may apply"]);
  });

  it("judges every personal row apart when the company has private data", () => {
    const plan = planPersonal({ privateData: true, rows, publicJudgements });
    expect(plan.copies).toEqual([]);
    expect(plan.toJudge).toEqual(rows);
  });
});
