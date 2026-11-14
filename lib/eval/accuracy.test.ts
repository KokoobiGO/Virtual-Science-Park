import { describe, expect, it } from "vitest";
import { accuracyTable, groupAccuracy, scoreAccuracy } from "./accuracy";
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

const file = (slug: string, claims: GoldClaim[]): GoldFile => ({
  slug,
  company: slug.toUpperCase(),
  exportedAt: "2026-11-14T10:00:00.000Z",
  checkedBy: "",
  howTo: "",
  claims,
});

describe("groupAccuracy", () => {
  it("is null, not 0 or 1, while nothing is checked", () => {
    expect(groupAccuracy([])).toEqual({ claims: 0, checked: 0, right: 0, wrong: 0, unchecked: 0, accuracy: null });
    expect(groupAccuracy([claim("stated", null), claim("stated", null)])).toMatchObject({ checked: 0, unchecked: 2, accuracy: null });
  });

  it("is right / checked, leaving the unchecked out", () => {
    expect(groupAccuracy([claim("stated", "right"), claim("stated", "wrong"), claim("stated", "right"), claim("stated", null)])).toEqual({
      claims: 4,
      checked: 3,
      right: 2,
      wrong: 1,
      unchecked: 1,
      accuracy: 2 / 3,
    });
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

  it("is complete only when every exported claim has a verdict", () => {
    expect(scoreAccuracy([file("a", [claim("stated", "right")]), file("b", [claim("missing", "wrong")])]).summary.complete).toBe(true);
    expect(scoreAccuracy([file("a", [claim("stated", "right")]), file("b", [claim("missing", null)])]).summary.complete).toBe(false);
    expect(scoreAccuracy([]).summary.complete).toBe(false);
    expect(scoreAccuracy([file("a", [])]).summary.complete).toBe(false);
  });

  it("lists every wrong claim with its field, value and note", () => {
    const wrong = claim("stated", "wrong", "The site says radars.");
    const result = scoreAccuracy([file("a", [claim("stated", "right"), wrong])]);
    expect(result.kind).toBe("profile_accuracy");
    expect(result.details.wrong).toEqual([
      { slug: "a", claimId: wrong.claimId, field: "offerings", status: "stated", value: ["sensors"], note: "The site says radars." },
    ]);
  });
});

describe("accuracyTable", () => {
  it("shows '-' for groups with nothing checked, and the wrong claims", () => {
    const lines = accuracyTable(scoreAccuracy([file("acme", [claim("stated", "right"), claim("stated", "wrong", "no"), claim("inferred", null)])]));
    expect(lines[0]).toMatch(/2 of 3 claims checked; complete: no/);
    expect(lines.find((l) => l.startsWith("acme"))).toMatch(/1\/2 of 2 = 50%\s+0\/0 of 1 = -/);
    expect(lines.at(-1)).toBe('wrong: acme offerings (stated) ["sensors"]: no');
  });
});
