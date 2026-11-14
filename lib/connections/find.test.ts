import { describe, expect, it } from "vitest";
import { connectionsToStore, FIRST_STEP_LABEL, storedBasis, summarize, type PairVerdict } from "./find";

const verdict = (over: Partial<PairVerdict>): PairVerdict => ({
  companyAId: "company-a",
  companyBId: "company-b",
  companyAName: "Nordsonar",
  companyBName: "Harbour Watch",
  similarity: 0.7,
  reasons: ["similar"],
  sharedOpportunities: [],
  outcome: "passed",
  check: null,
  reason: null,
  fit: "supplier_user",
  aBrings: "hydrophones",
  bBrings: "port security",
  opportunityTitle: null,
  basis: "Nordsonar makes hydrophones. Harbour Watch runs port security.",
  firstStep: "Introduce the two with underwater sensing as the topic.",
  sharedOn: ["port security"],
  evidence: [],
  cited: { A: ["C1"], B: ["C3"] },
  seconds: 5,
  usage: { inputTokens: 1000, outputTokens: 100 },
  ...over,
});

describe("connectionsToStore", () => {
  it("stores only passed pairs, with the first step for BSP staff after the basis", () => {
    const rows = connectionsToStore([verdict({}), verdict({ outcome: "rejected", companyBId: "company-c" })]);
    expect(rows).toEqual([
      {
        companyAId: "company-a",
        companyBId: "company-b",
        score: 0.7,
        basis: `Nordsonar makes hydrophones. Harbour Watch runs port security. ${FIRST_STEP_LABEL} Introduce the two with underwater sensing as the topic.`,
        sharedOn: ["port security"],
        evidence: [],
      },
    ]);
  });

  it("stores the basis alone when there is no first step", () => {
    expect(storedBasis("Basis.", "")).toBe("Basis.");
  });
});

describe("summarize", () => {
  it("counts outcomes, sources and tokens", () => {
    const summary = summarize([
      verdict({ reasons: ["similar", "role"] }),
      verdict({ outcome: "rejected", check: "plausible", reasons: ["opportunity"] }),
      verdict({ outcome: "failed", check: "brings", reasons: ["role"] }),
      verdict({ outcome: "skipped", reasons: ["similar"], usage: { inputTokens: 0, outputTokens: 0 } }),
    ]);
    expect(summary).toMatchObject({
      candidates: 4,
      bySource: { similar: 2, role: 2, opportunity: 1 },
      judged: 3,
      plausible: 2,
      passed: 1,
      rejected: 1,
      failed: 1,
      skipped: 1,
      failedChecks: { brings: 1 },
      tokens: { input: 3000, output: 300 },
    });
  });
});
