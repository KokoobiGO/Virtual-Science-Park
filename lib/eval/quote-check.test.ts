import { describe, expect, it } from "vitest";
import { latestProfileRuns, quoteCheckTable, quoteTotals, scoreQuoteCheck, type ProfileRunRow } from "./quote-check";

const row = (id: string, finishedAt: string, stats: Record<string, unknown>): ProfileRunRow => ({
  id,
  startedAt: new Date("2026-11-14T08:00:00Z"),
  finishedAt: new Date(finishedAt),
  stats: { quotes: { found: 4, total: 5 }, retried: [], dropped: [], stored: { active: 8, evidence: 4, suggested: 0, superseded: 0 }, ...stats },
});

describe("latestProfileRuns", () => {
  it("takes each company's latest stored run, leaving refreshes out", () => {
    const { runs, skipped } = latestProfileRuns([
      row("old", "2026-11-14T09:00:00Z", { company: "acme" }),
      row("new", "2026-11-14T10:00:00Z", { company: "acme", refresh: false }),
      row("refresh", "2026-11-14T11:00:00Z", { company: "acme", refresh: true }),
      row("other", "2026-11-14T09:30:00Z", { company: "beta" }),
    ]);
    expect(runs.map((r) => [r.slug, r.runId])).toEqual([
      ["acme", "new"],
      ["beta", "other"],
    ]);
    expect(runs[0].storedAt).toBe("2026-11-14T10:00:00.000Z");
    expect(skipped).toEqual([]);
  });

  it("skips rows whose stats it cannot read, and says why", () => {
    const { runs, skipped } = latestProfileRuns([
      row("bad", "2026-11-14T10:00:00Z", { company: "acme", quotes: "many" }),
      { id: "empty", startedAt: new Date(), finishedAt: null, stats: null },
    ]);
    expect(runs).toEqual([]);
    expect(skipped.map((s) => s.runId)).toEqual(["bad", "empty"]);
    expect(skipped[0].reason).toMatch(/quotes/);
  });

  it("works out the shares of one run", () => {
    const { runs } = latestProfileRuns([
      row("r", "2026-11-14T10:00:00Z", {
        company: "acme",
        quotes: { found: 3, total: 7 },
        retried: ["markets", "geography", "summary", "offerings"],
        dropped: ["markets", "geography"],
      }),
    ]);
    expect(runs[0]).toMatchObject({
      quotesFound: 3,
      quotesTotal: 7,
      quotesFailedShare: 4 / 7,
      droppedOfFields: 2 / 8,
      droppedOfRetried: 2 / 4,
    });
  });

  it("gives null shares, not 0, when there is nothing to divide by", () => {
    const { runs } = latestProfileRuns([row("r", "2026-11-14T10:00:00Z", { company: "acme", quotes: { found: 0, total: 0 } })]);
    expect(runs[0]).toMatchObject({ quotesFailedShare: null, droppedOfFields: 0, droppedOfRetried: null });
  });
});

describe("quoteTotals", () => {
  it("sums the runs and counts the dropped fields, most often first", () => {
    const { runs } = latestProfileRuns([
      row("1", "2026-11-14T10:00:00Z", { company: "a", quotes: { found: 10, total: 11 }, retried: ["geography"], dropped: ["geography"] }),
      row("2", "2026-11-14T10:00:00Z", {
        company: "b",
        quotes: { found: 3, total: 7 },
        retried: ["markets", "geography", "offerings"],
        dropped: ["markets", "geography"],
      }),
      row("3", "2026-11-14T10:00:00Z", { company: "c", quotes: { found: 5, total: 5 } }),
    ]);
    const totals = quoteTotals(runs);
    expect(totals).toEqual({
      runs: 3,
      quotesFound: 18,
      quotesTotal: 23,
      quotesFailedShare: 5 / 23,
      retriedFields: 4,
      droppedFields: 3,
      profileFields: 24,
      droppedOfFields: 3 / 24,
      droppedOfRetried: 3 / 4,
      droppedByField: { geography: 2, markets: 1 },
    });
    expect(Object.keys(totals.droppedByField)).toEqual(["geography", "markets"]);
  });

  it("is all nulls for no runs", () => {
    expect(quoteTotals([])).toMatchObject({ runs: 0, quotesFailedShare: null, droppedOfFields: null, droppedOfRetried: null, droppedByField: {} });
  });
});

describe("scoreQuoteCheck", () => {
  it("gives the gold members a block of their own, and the totals over every company", () => {
    const result = scoreQuoteCheck(
      ["acme", "gone"],
      [
        row("1", "2026-11-14T10:00:00Z", { company: "acme", dropped: ["summary"], retried: ["summary"] }),
        row("2", "2026-11-14T10:00:00Z", { company: "beta" }),
      ],
    );
    expect(result.kind).toBe("quote_check");
    expect(result.summary.gold.companies.map((r) => r.slug)).toEqual(["acme"]);
    expect(result.summary.gold.withoutRun).toEqual(["gone"]);
    expect(result.summary.gold.total).toMatchObject({ runs: 1, droppedFields: 1 });
    expect(result.summary.all).toMatchObject({ runs: 2, droppedFields: 1, quotesFound: 8, quotesTotal: 10 });
    expect(result.summary.note).toMatch(/cannot be computed/);
    expect(result.details.runs).toHaveLength(2);

    const lines = quoteCheckTable(result);
    expect(lines.find((l) => l.startsWith("acme"))).toMatch(/4\/5\s+20%\s+1\s+1\s+1\/8 = 13%\s+1\/1 = 100%/);
    expect(lines.find((l) => l.startsWith("all companies"))).toMatch(/2 runs\s+8\/10\s+20%/);
    expect(lines).toContain("no stored profiling run: gone");
  });
});
