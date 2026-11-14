import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { scoreAccuracy } from "../eval/accuracy";
import type { GoldClaim, GoldFile } from "../eval/gold-file";
import { scoreQuoteCheck } from "../eval/quote-check";
import {
  accuracyText,
  buildTrustReport,
  formatDateTime,
  formatDay,
  formatSeconds,
  HAND_CHECK_NOT_FINISHED,
  handCheckStarted,
  matchingResult,
  median,
  NOT_MEASURED,
  parseResultsFile,
  percentOf,
  readRun,
  summarizeStaffSession,
  summarizeTimedTest,
  type EvalRunRow,
  type MatchCountRow,
} from "./report";
import {
  LinkCheckSummary,
  PrivacySummary,
  ProfileAccuracySummary,
  QuoteCheckSummary,
  RedTeamSummary,
  StaffSessionResults,
  TimedTestResults,
} from "./shapes";

const at = (iso: string) => new Date(iso);
const run = (kind: string, ranAt: string, summary: unknown): EvalRunRow => ({ kind, ranAt: at(ranAt), summary });

const claim = (n: number, status: GoldClaim["status"], verdict: GoldClaim["verdict"]): GoldClaim => ({
  claimId: `00000000-0000-4000-8000-00000000000${n}`,
  field: "summary",
  status,
  value: "A value",
  confidence: 0.9,
  evidence: [],
  verdict,
  note: "",
});
const goldFile = (slug: string, claims: GoldClaim[]): GoldFile => ({ slug, company: slug.toUpperCase(), exportedAt: "2026-11-14T18:00:00Z", checkedBy: "", howTo: "", claims });

describe("readRun", () => {
  const schema = LinkCheckSummary;
  const ok = { checked: 3, ok: 2, broken: 1, blocked: 0 };

  it("takes the latest run of the kind, whatever the row order", () => {
    const result = readRun(
      [run("link_check", "2026-11-14T10:00:00Z", { ...ok, ok: 1 }), run("link_check", "2026-11-14T12:00:00Z", ok), run("quote_check", "2026-11-15T00:00:00Z", {})],
      "link_check",
      schema,
    );
    expect(result).toEqual({ status: "measured", ranAt: at("2026-11-14T12:00:00Z"), summary: ok });
  });

  it("is not measured when there is no run of the kind", () => {
    expect(readRun([run("quote_check", "2026-11-14T10:00:00Z", {})], "link_check", schema)).toEqual({ status: "not_measured" });
  });

  it("keeps the date but no number when the summary cannot be read", () => {
    const result = readRun([run("link_check", "2026-11-14T10:00:00Z", { checked: "many" })], "link_check", schema);
    expect(result.status).toBe("unreadable");
    if (result.status !== "unreadable") return;
    expect(result.ranAt).toEqual(at("2026-11-14T10:00:00Z"));
    expect(result.problem).toMatch(/checked/);
  });
});

describe("the stored summaries parse", () => {
  it("reads what lib/eval/accuracy.ts stores", () => {
    const { summary } = scoreAccuracy([goldFile("acme", [claim(1, "stated", "right"), claim(2, "inferred", null), claim(3, "missing", "wrong")])]);
    const parsed = ProfileAccuracySummary.parse(summary);
    expect(parsed.companies[0]).toMatchObject({ slug: "acme", company: "ACME", stated: { right: 1, checked: 1, accuracy: 1 } });
    expect(parsed.total.inferred).toMatchObject({ checked: 0, accuracy: null });
  });

  it("reads what lib/eval/quote-check.ts stores", () => {
    const stats = { company: "acme", quotes: { found: 3, total: 4 }, retried: ["markets"], dropped: ["markets"] };
    const { summary } = scoreQuoteCheck(["acme", "gone"], [{ id: "r1", startedAt: at("2026-11-14T09:00:00Z"), finishedAt: at("2026-11-14T09:01:00Z"), stats }]);
    const parsed = QuoteCheckSummary.parse(JSON.parse(JSON.stringify(summary)));
    expect(parsed.gold.companies[0]).toMatchObject({ slug: "acme", quotesFound: 3, quotesTotal: 4, dropped: ["markets"] });
    expect(parsed.gold.withoutRun).toEqual(["gone"]);
    expect(parsed.all).toMatchObject({ runs: 1, droppedFields: 1, profileFields: 8 });
  });

  it("reads what scripts/check-links.ts stores", () => {
    const summary = { checked: 181, ok: 181, broken: 0, blocked: 0, startedAt: "2026-11-14T17:27:12.807Z", finishedAt: "2026-11-14T17:27:18.256Z" };
    expect(LinkCheckSummary.parse(summary)).toEqual({ checked: 181, ok: 181, broken: 0, blocked: 0 });
  });

  it("refuses a red-team or privacy summary with more passed than run", () => {
    expect(RedTeamSummary.safeParse({ groups: [{ group: "prompt injection", passed: 9, total: 10 }] }).success).toBe(true);
    expect(RedTeamSummary.safeParse({ groups: [{ group: "prompt injection", passed: 11, total: 10 }] }).success).toBe(false);
    expect(RedTeamSummary.safeParse({ groups: [] }).success).toBe(false);
    expect(PrivacySummary.safeParse({ passed: 5, total: 5 }).success).toBe(true);
    expect(PrivacySummary.safeParse({ passed: 6, total: 5 }).success).toBe(false);
    expect(PrivacySummary.safeParse({ passed: 0, total: 0 }).success).toBe(false);
  });
});

describe("profile accuracy", () => {
  it("counts as started only once a claim has a verdict", () => {
    const none = ProfileAccuracySummary.parse(scoreAccuracy([goldFile("acme", [claim(1, "stated", null)])]).summary);
    const one = ProfileAccuracySummary.parse(scoreAccuracy([goldFile("acme", [claim(1, "stated", "wrong"), claim(2, "stated", null)])]).summary);
    expect(handCheckStarted(none)).toBe(false);
    expect(handCheckStarted(one)).toBe(true);
    expect(HAND_CHECK_NOT_FINISHED).toBe("not measured yet: the team's hand-check is not finished");
  });

  it("writes a cell only for checked claims", () => {
    expect(accuracyText({ claims: 6, checked: 5, right: 4, wrong: 1, unchecked: 1, accuracy: 0.8 })).toBe("80% (4 of 5 checked)");
    expect(accuracyText({ claims: 6, checked: 0, right: 0, wrong: 0, unchecked: 6, accuracy: null })).toBe(NOT_MEASURED);
  });
});

describe("parseResultsFile", () => {
  it("is not measured when there is no file", () => {
    expect(parseResultsFile(null, TimedTestResults)).toEqual({ status: "not_measured" });
  });

  it("says why a file cannot be read", () => {
    expect(parseResultsFile("{ not json", TimedTestResults)).toMatchObject({ status: "unreadable", problem: expect.stringMatching(/not valid JSON/) });
    const wrong = parseResultsFile(JSON.stringify({ date: "20 Nov", task: "x", trials: [] }), TimedTestResults);
    expect(wrong).toMatchObject({ status: "unreadable", problem: expect.stringMatching(/date/) });
  });

  it("refuses keys the shape does not have, so a typo is not silently dropped", () => {
    const text = JSON.stringify({ date: "2026-11-21", staff: 1, ratings: [{ kind: "match", item: "x", verdict: "useful", score: 5 }] });
    expect(parseResultsFile(text, StaffSessionResults).status).toBe("unreadable");
  });

  it.each([
    ["data/timed-test/results.example.json", TimedTestResults, "2026-11-20"],
    ["data/staff-session/results.example.json", StaffSessionResults, "2026-11-21"],
  ] as const)("reads the committed example %s", (file, schema, date) => {
    const text = readFileSync(path.join(process.cwd(), file), "utf8");
    expect(parseResultsFile(text, schema as typeof TimedTestResults)).toMatchObject({ status: "measured", date });
  });
});

describe("summaries of the results files", () => {
  it("gives each method's trials, completions and the median time of the completed ones", () => {
    const results = TimedTestResults.parse({
      date: "2026-11-20",
      task: "Find two calls",
      trials: [
        { participant: "P1", method: "with_app", seconds: 100, completed: true },
        { participant: "P2", method: "with_app", seconds: 300, completed: true },
        { participant: "P3", method: "with_app", seconds: 50, completed: false },
        { participant: "P1", method: "without_app", seconds: 900, completed: false },
      ],
    });
    expect(summarizeTimedTest(results)).toEqual([
      { method: "with_app", trials: 3, completed: 2, medianSeconds: 200 },
      { method: "without_app", trials: 1, completed: 0, medianSeconds: null },
    ]);
  });

  it("counts the staff's verdicts per kind, leaving out kinds nobody rated", () => {
    const results = StaffSessionResults.parse({
      date: "2026-11-21",
      staff: 2,
      ratings: [
        { kind: "match", item: "a", verdict: "useful" },
        { kind: "match", item: "b", verdict: "unsure" },
        { kind: "profile", item: "c", verdict: "not_useful" },
      ],
    });
    expect(summarizeStaffSession(results)).toEqual([
      { kind: "match", useful: 1, notUseful: 0, unsure: 1, total: 2 },
      { kind: "profile", useful: 0, notUseful: 1, unsure: 0, total: 1 },
    ]);
  });

  it("takes the median of odd and even counts", () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe("matchingResult", () => {
  const row = (mode: MatchCountRow["mode"], overrides: Partial<MatchCountRow> = {}): MatchCountRow => ({
    mode,
    companies: 56,
    judged: 10,
    rejected: 4,
    rankedUnjudged: 2,
    lastJudgedAt: at("2026-11-14T19:00:00Z"),
    ...overrides,
  });

  it("is not measured while nothing is judged", () => {
    expect(matchingResult("staff", [])).toEqual({ status: "not_measured" });
    expect(matchingResult("member", [row("public", { judged: 0, rejected: 0, lastJudgedAt: null })])).toEqual({ status: "not_measured" });
  });

  it("works out kept, puts the public ranking first and dates it by the latest judgement", () => {
    const result = matchingResult("member", [row("personal", { lastJudgedAt: at("2026-11-14T19:20:00Z") }), row("public")]);
    expect(result).toMatchObject({ status: "measured", scope: "own_company", ranAt: at("2026-11-14T19:20:00Z") });
    if (result.status !== "measured") return;
    expect(result.modes.map((m) => [m.mode, m.kept])).toEqual([
      ["public", 6],
      ["personal", 6],
    ]);
  });

  it("says staff count every member's public ranking", () => {
    expect(matchingResult("staff", [row("public")])).toMatchObject({ scope: "all_members_public" });
  });
});

describe("buildTrustReport", () => {
  const NOW = at("2026-11-14T20:00:00Z");

  it("says not measured for every section without data, and makes up nothing", () => {
    const report = buildTrustReport({ role: "member", evalRuns: [], sources: [], matches: [], timedTestText: null, staffSessionText: null, now: NOW });
    expect(report).toEqual({
      profileAccuracy: { status: "not_measured" },
      quoteCheck: { status: "not_measured" },
      linkCheck: { status: "not_measured" },
      sources: [],
      matching: { status: "not_measured" },
      redTeam: { status: "not_measured" },
      privacy: { status: "not_measured" },
      timedTest: { status: "not_measured" },
      staffSession: { status: "not_measured" },
    });
  });

  it("reads each eval from its own kind and judges the sources at the given time", () => {
    const report = buildTrustReport({
      role: "staff",
      evalRuns: [run("link_check", "2026-11-14T17:27:18Z", { checked: 2, ok: 1, broken: 1, blocked: 0 }), run("privacy", "2026-11-14T19:00:00Z", { passed: 7, total: 7 })],
      sources: [
        { source: "vinnova", label: "Vinnova", state: "live", lastSuccessAt: at("2026-11-14T16:49:39Z"), cachedAt: null, itemCount: 15, message: null },
        { source: "regional", label: "Regional", state: "simulated", lastSuccessAt: at("2026-11-14T16:53:27Z"), cachedAt: null, itemCount: 8, message: "Hand-entered" },
      ],
      matches: [],
      timedTestText: null,
      staffSessionText: null,
      now: NOW,
    });
    expect(report.linkCheck).toMatchObject({ status: "measured", summary: { ok: 1, broken: 1 } });
    expect(report.privacy).toMatchObject({ status: "measured", summary: { passed: 7, total: 7 } });
    expect(report.redTeam).toEqual({ status: "not_measured" });
    expect(report.sources.map((s) => [s.source, s.verdict])).toEqual([
      ["regional", "hand_entered"],
      ["vinnova", "ok"],
    ]);
  });
});

describe("formatting", () => {
  it("writes dates in Swedish time and days as they are", () => {
    expect(formatDateTime(at("2026-11-14T18:11:13Z"))).toBe("14 Nov 2026, 19:11 CET");
    expect(formatDay("2026-11-20")).toBe("20 Nov 2026");
  });

  it("writes seconds and shares", () => {
    expect(formatSeconds(45)).toBe("45 s");
    expect(formatSeconds(125)).toBe("2 min 5 s");
    expect(formatSeconds(600)).toBe("10 min");
    expect(percentOf(1, 4)).toBe("25%");
    expect(percentOf(0, 0)).toBe("-");
  });
});
