import { describe, expect, it } from "vitest";
import { scoreAccuracy } from "../eval/accuracy";
import type { GoldClaim, GoldFile } from "../eval/gold-file";
import { automatedReviewCompanies, ProfileAccuracySummary } from "./shapes";

const claim = (n: number, status: GoldClaim["status"], verdict: GoldClaim["verdict"]): GoldClaim => ({
  claimId: `00000000-0000-4000-8000-00000000000${n}`,
  field: "summary",
  status,
  value: status === "missing" ? null : "A value",
  confidence: status === "missing" ? 0 : 0.9,
  evidence: [],
  verdict,
  note: "",
});

const AI = { checkedBy: "automated reviewer (AI), not a person", checkedOn: "2026-11-14", automatedReviewer: true, confirmedByTeam: false };

const goldFile = (slug: string, claims: GoldClaim[], review: Partial<GoldFile> = {}): GoldFile => ({
  slug,
  company: slug.toUpperCase(),
  exportedAt: "2026-11-14T18:00:00Z",
  checkedBy: "",
  howTo: "",
  claims,
  ...review,
});

describe("ProfileAccuracySummary", () => {
  it("reads the unsure count and who checked, as lib/eval/accuracy.ts stores them", () => {
    const { summary } = scoreAccuracy([goldFile("acme", [claim(1, "stated", "right"), claim(2, "inferred", "unsure")], AI)]);
    const parsed = ProfileAccuracySummary.parse(JSON.parse(JSON.stringify(summary)));
    expect(parsed.companies[0]).toMatchObject({ ...AI, inferred: { checked: 1, right: 0, unsure: 1, accuracy: 0 } });
    expect(parsed.total.all).toMatchObject({ checked: 2, right: 1, wrong: 0, unsure: 1 });
  });

  it("still reads a run stored before unsure and the reviewer keys existed", () => {
    const group = { claims: 1, checked: 0, right: 0, wrong: 0, unchecked: 1, accuracy: null };
    const block = { stated: group, inferred: group, missing: group, all: group };
    const parsed = ProfileAccuracySummary.parse({ complete: false, total: block, companies: [{ ...block, slug: "acme", company: "Acme" }] });
    expect(parsed.companies[0].automatedReviewer).toBeUndefined();
    expect(automatedReviewCompanies(parsed)).toEqual([]);
  });
});

describe("automatedReviewCompanies", () => {
  it("names the profiles an automated reviewer checked and no team member has confirmed", () => {
    const summary = ProfileAccuracySummary.parse(
      scoreAccuracy([
        goldFile("a", [claim(1, "stated", "right")], AI),
        goldFile("b", [claim(2, "stated", "right")], { ...AI, confirmedByTeam: true }),
        goldFile("c", [claim(3, "stated", "wrong")], { checkedBy: "Sara", checkedOn: "2026-11-15" }),
      ]).summary,
    );
    expect(automatedReviewCompanies(summary)).toEqual(["A"]);
  });
});
