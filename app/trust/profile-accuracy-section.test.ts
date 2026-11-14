import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { scoreAccuracy } from "@/lib/eval/accuracy";
import type { GoldClaim, GoldFile } from "@/lib/eval/gold-file";
import { ProfileAccuracySummary } from "@/lib/trust/shapes";
import { ProfileAccuracySection } from "./sections";

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

const run = (review: Partial<GoldFile>) => ({
  status: "measured" as const,
  ranAt: new Date("2026-11-14T20:00:00Z"),
  summary: ProfileAccuracySummary.parse(
    scoreAccuracy([
      {
        slug: "acme",
        company: "Acme",
        exportedAt: "2026-11-14T18:00:00Z",
        checkedBy: "",
        howTo: "",
        claims: [claim(1, "stated", "right"), claim(2, "stated", "wrong"), claim(3, "inferred", "unsure"), claim(4, "missing", "wrong")],
        ...review,
      },
    ]).summary,
  ),
});

describe("ProfileAccuracySection (A21)", () => {
  it("shows the run date, the numbers and that an automated reviewer, not people, gave the verdicts", () => {
    const out = renderToStaticMarkup(createElement(ProfileAccuracySection, { run: run(AI) }));
    expect(out).toContain("Run 14 Nov 2026");
    expect(out).toContain("The verdicts for Acme come from an automated reviewer (AI), not from people. No team member has confirmed them yet.");
    expect(out).toContain("50% (1 of 2 checked)");
    expect(out).toContain("0% (0 of 1 checked, 1 unsure)");
  });

  it("says it in Swedish too", () => {
    const out = renderToStaticMarkup(createElement(ProfileAccuracySection, { run: run(AI), locale: "sv" }));
    expect(out).toContain("kommer från en automatisk granskare (AI), inte från människor");
    expect(out).toContain("1 osäker)");
  });

  it("drops the label once a team member has confirmed the verdicts, or when people gave them", () => {
    for (const review of [{ ...AI, confirmedByTeam: true }, { checkedBy: "Sara", checkedOn: "2026-11-15" }]) {
      const out = renderToStaticMarkup(createElement(ProfileAccuracySection, { run: run(review) }));
      expect(out).not.toContain("automated reviewer");
      expect(out).toContain("50% (1 of 2 checked)");
    }
  });
});
