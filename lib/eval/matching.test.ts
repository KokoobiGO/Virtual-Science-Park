import { describe, expect, it } from "vitest";
import { MatchingSummary } from "../trust/shapes";
import { matchingTable, scoreMatching, type MatchingCountRow } from "./matching";

const row = (mode: MatchingCountRow["mode"], overrides: Partial<MatchingCountRow> = {}): MatchingCountRow => ({
  mode,
  companies: 56,
  ranked: 1120,
  judged: 1000,
  rejected: 400,
  lastJudgedAt: new Date("2026-11-14T19:00:00Z"),
  ...overrides,
});

describe("scoreMatching", () => {
  it("stores both modes, public first, with kept and not judged yet worked out", () => {
    const result = scoreMatching([row("personal", { judged: 1120, rejected: 300 }), row("public")]);
    expect(result.kind).toBe("matching");
    expect(result.summary.modes).toEqual([
      { mode: "public", companies: 56, ranked: 1120, judged: 1000, kept: 600, rejected: 400, notJudgedYet: 120, lastJudgedAt: "2026-11-14T19:00:00.000Z" },
      { mode: "personal", companies: 56, ranked: 1120, judged: 1120, kept: 820, rejected: 300, notJudgedYet: 0, lastJudgedAt: "2026-11-14T19:00:00.000Z" },
    ]);
    for (const m of result.summary.modes) expect(m.kept + m.rejected + m.notJudgedYet).toBe(m.ranked);
  });

  it("writes zeros for a mode without ranked matches", () => {
    expect(scoreMatching([row("public")]).summary.modes[1]).toEqual({
      mode: "personal",
      companies: 0,
      ranked: 0,
      judged: 0,
      kept: 0,
      rejected: 0,
      notJudgedYet: 0,
      lastJudgedAt: null,
    });
  });

  it("stores only totals, which the Trust report reads back after a trip through jsonb", () => {
    const { summary, details } = scoreMatching([row("public"), row("personal", { lastJudgedAt: null, judged: 0, rejected: 0 })]);
    expect(MatchingSummary.parse(JSON.parse(JSON.stringify(summary)))).toEqual(summary);
    expect(Object.keys(details)).toEqual(["definitions"]);
  });

  it("prints a table with one line per mode", () => {
    const lines = matchingTable(scoreMatching([row("public")]).summary);
    expect(lines).toHaveLength(4);
    expect(lines[2]).toMatch(/^public\s+56\s+1120\s+1000\s+600 \(60%\)\s+400 \(40%\)\s+120\s+2026-11-14 19:00$/);
    expect(lines[3]).toMatch(/^personal\s+0\s+0\s+0\s+0 \(-\)\s+0 \(-\)\s+0\s+-$/);
  });
});
