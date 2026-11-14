import { describe, expect, it } from "vitest";
import { accuracyTable, groupAccuracy, reviewerText, scoreAccuracy } from "./accuracy";
import type { GoldClaim, GoldFile, GoldStatus, Verdict } from "./gold-file";

let n = 0;
const claim = (status: GoldStatus, verdict: Verdict | null, note = ""): GoldClaim => ({
  claimId: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
  field: "offerings",
  status,
  value: status === "missing" ? null : ["sensors"],
  confidence: status === "missing" ? 0 : 1,
  evidence: [],
  verdict,
  note,
});

const file = (slug: string, claims: GoldClaim[], review: Partial<GoldFile> = {}): GoldFile => ({
  slug,
  company: slug.toUpperCase(),
  exportedAt: "2026-11-14T10:00:00.000Z",
  checkedBy: "",
  howTo: "",
  claims,
  ...review,
});

describe("groupAccuracy", () => {
  it("is null, not 0 or 1, while nothing is checked", () => {
    expect(groupAccuracy([])).toEqual({ claims: 0, checked: 0, right: 0, wrong: 0, unsure: 0, unchecked: 0, accuracy: null });
    expect(groupAccuracy([claim("stated", null), claim("stated", null)])).toMatchObject({ checked: 0, unchecked: 2, accuracy: null });
  });

  it("is right / checked, leaving the unchecked out", () => {
    expect(groupAccuracy([claim("stated", "right"), claim("stated", "wrong"), claim("stated", "right"), claim("stated", null)])).toEqual({
      claims: 4,
      checked: 3,
      right: 2,
      wrong: 1,
      unsure: 0,
      unchecked: 1,
      accuracy: 2 / 3,
    });
  });

  it("counts unsure as checked and on its own, never as right", () => {
    expect(groupAccuracy([claim("inferred", "right"), claim("inferred", "unsure")])).toEqual({
      claims: 2,
      checked: 2,
      right: 1,
      wrong: 0,
      unsure: 1,
      unchecked: 0,
      accuracy: 0.5,
    });
    expect(groupAccuracy([claim("inferred", "unsure")]).accuracy).toBe(0);
  });
});

describe("scoreAccuracy", () => {
  it("counts stated, inferred and missing apart, per company and in total", () => {
    const { summary } = scoreAccuracy([
      file("a", [claim("stated", "right"), claim("stated", "wrong"), claim("inferred", "right"), claim("missing", null)]),
      file("b", [claim("stated", "right"), claim("inferred", null), claim("missing", "wrong")]),
    ]);
    const [a, b] = summary.companies;
    expect(a).toMatchObject({ slug: "a", complete: false });
    expect(a.stated).toMatchObject({ claims: 2, checked: 2, right: 1, accuracy: 0.5 });
    expect(a.inferred).toMatchObject({ checked: 1, accuracy: 1 });
    expect(a.missing).toMatchObject({ checked: 0, unchecked: 1, accuracy: null });
    expect(b.inferred.accuracy).toBeNull();
    expect(b.missing).toMatchObject({ checked: 1, right: 0, accuracy: 0 });
    expect(summary.total.stated).toMatchObject({ claims: 3, checked: 3, right: 2, accuracy: 2 / 3 });
    expect(summary.total.inferred).toMatchObject({ claims: 2, checked: 1, unchecked: 1, accuracy: 1 });
    expect(summary.total.all).toMatchObject({ claims: 7, checked: 5, right: 3, unchecked: 2 });
    expect(summary.complete).toBe(false);
  });

  it("is complete only when every exported claim has a verdict, unsure included", () => {
    expect(scoreAccuracy([file("a", [claim("stated", "right")]), file("b", [claim("missing", "wrong")])]).summary.complete).toBe(true);
    expect(scoreAccuracy([file("a", [claim("stated", "unsure")])]).summary.complete).toBe(true);
    expect(scoreAccuracy([file("a", [claim("stated", "right")]), file("b", [claim("missing", null)])]).summary.complete).toBe(false);
    expect(scoreAccuracy([]).summary.complete).toBe(false);
    expect(scoreAccuracy([file("a", [])]).summary.complete).toBe(false);
  });

  it("lists every wrong and unsure claim with its field, value, note and checked pages", () => {
    const wrong = claim("stated", "wrong", "The site says radars.");
    const unsure = { ...claim("inferred", "unsure", "The page does not settle it."), checkedUrls: ["https://a.example/"] };
    const result = scoreAccuracy([file("a", [claim("stated", "right"), wrong, unsure])]);
    expect(result.kind).toBe("profile_accuracy");
    expect(result.details.wrong).toEqual([
      { slug: "a", claimId: wrong.claimId, field: "offerings", status: "stated", value: ["sensors"], note: "The site says radars.", checkedUrls: [] },
    ]);
    expect(result.details.unsure).toEqual([
      {
        slug: "a",
        claimId: unsure.claimId,
        field: "offerings",
        status: "inferred",
        value: ["sensors"],
        note: "The page does not settle it.",
        checkedUrls: ["https://a.example/"],
      },
    ]);
  });

  it("carries who checked each file, and says nothing about a reviewer the file does not name", () => {
    const { summary } = scoreAccuracy([
      file("a", [claim("stated", "right")], {
        checkedBy: "automated reviewer (AI), not a person",
        checkedOn: "2026-11-14",
        automatedReviewer: true,
        confirmedByTeam: false,
      }),
      file("b", [claim("stated", null)]),
    ]);
    expect(summary.companies[0]).toMatchObject({
      checkedBy: "automated reviewer (AI), not a person",
      checkedOn: "2026-11-14",
      automatedReviewer: true,
      confirmedByTeam: false,
    });
    expect(summary.companies[1]).toMatchObject({ checkedBy: "", checkedOn: null, automatedReviewer: false, confirmedByTeam: false });
  });
});

describe("reviewerText", () => {
  it("names the reviewer and day, and whether a team member confirmed an automated review", () => {
    const ai = { checkedBy: "automated reviewer (AI), not a person", checkedOn: "2026-11-14", automatedReviewer: true, confirmedByTeam: false };
    expect(reviewerText(ai)).toBe("checked by automated reviewer (AI), not a person on 2026-11-14; not confirmed by a team member");
    expect(reviewerText({ ...ai, confirmedByTeam: true })).toMatch(/; confirmed by a team member$/);
    expect(reviewerText({ checkedBy: "Sara", checkedOn: null, automatedReviewer: false, confirmedByTeam: false })).toBe("checked by Sara");
    expect(reviewerText({ checkedBy: "", checkedOn: null, automatedReviewer: false, confirmedByTeam: false })).toBe("no reviewer named");
  });
});

describe("accuracyTable", () => {
  it("shows '-' for groups with nothing checked, the reviewer, and the wrong claims", () => {
    const lines = accuracyTable(scoreAccuracy([file("acme", [claim("stated", "right"), claim("stated", "wrong", "no"), claim("inferred", null)])]));
    expect(lines[0]).toMatch(/2 of 3 claims checked; complete: no/);
    expect(lines.find((l) => l.startsWith("acme"))).toMatch(/1\/2 of 2 = 50%\s+0\/0 of 1 = -/);
    expect(lines).toContain("reviewer acme: no reviewer named");
    expect(lines.at(-1)).toBe('wrong: acme offerings (stated) ["sensors"]: no');
  });

  it("lists the unsure claims after the wrong ones", () => {
    const lines = accuracyTable(scoreAccuracy([file("acme", [claim("inferred", "unsure", "not settled"), claim("stated", "wrong", "no")])]));
    expect(lines.slice(-2)).toEqual(['wrong: acme offerings (stated) ["sensors"]: no', 'unsure: acme offerings (inferred) ["sensors"]: not settled']);
  });
});
