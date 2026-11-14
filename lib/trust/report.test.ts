import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { scoreAccuracy } from "../eval/accuracy";
import type { GoldClaim, GoldFile } from "../eval/gold-file";
import { scoreMatching } from "../eval/matching";
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
  NOT_MEASURED,
  parseResultsFile,
  percentOf,
  ratingText,
  readRun,
  summarizeStaffSession,
  summarizeTimedTest,
  timedRunText,
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
    const wrong = parseResultsFile(JSON.stringify({ date: "20 Nov", trials: [] }), TimedTestResults);
    expect(wrong).toMatchObject({ status: "unreadable", problem: expect.stringMatching(/date/) });
  });

  it("refuses keys the shape does not have, so a typo is not silently dropped", () => {
    const text = JSON.stringify({ date: "2026-11-21", staff: 1, members: [{ member: "acme", claims: [{ claim: 1, rating: "right", score: 5 }], top5: [] }] });
    expect(parseResultsFile(text, StaffSessionResults).status).toBe("unreadable");
  });

  it.each([
    ["data/timed-test/results.example.json", TimedTestResults, "2026-11-20"],
    ["data/staff-session/results.example.json", StaffSessionResults, "2026-11-21"],
  ] as const)("reads the committed example %s", (file, schema, date) => {
    const text = readFileSync(path.join(process.cwd(), file), "utf8");
    expect(parseResultsFile(text, schema as typeof TimedTestResults)).toMatchObject({ status: "measured", date });
  });

  it("summarises the committed examples: both tasks both ways, and each member's sheets", () => {
    const read = (file: string) => JSON.parse(readFileSync(path.join(process.cwd(), file), "utf8"));
    const timed = summarizeTimedTest(TimedTestResults.parse(read("data/timed-test/results.example.json")));
    expect(timed.map((r) => [r.task, r.byHand !== null, r.withTool !== null])).toEqual([
      ["A", true, true],
      ["B", true, true],
    ]);
    const staff = summarizeStaffSession(StaffSessionResults.parse(read("data/staff-session/results.example.json")));
    expect(staff.members.map((m) => [m.member, m.claims.rated, m.top5.rated])).toEqual([
      ["embeddedart", 7, 5],
      ["techinova", 2, 0],
    ]);
    expect(staff.quotesWithheld).toBe(1);
  });
});

describe("the timed-test results file", () => {
  const trial = (overrides: Record<string, unknown> = {}) => ({
    participant: "P1",
    task: "A",
    method: "without_app",
    seconds: 900,
    completed: false,
    found: 2,
    points: 1,
    ...overrides,
  });
  const parse = (data: Record<string, unknown>) => TimedTestResults.safeParse({ date: "2026-11-20", ...data });
  const problem = (data: Record<string, unknown>) => {
    const parsed = parse(data);
    return parsed.success ? "" : z.prettifyError(parsed.error);
  };

  it("takes one trial per record sheet: tester, task, method, time, how it ended, results found and points", () => {
    expect(parse({ trials: [trial(), trial({ method: "with_app", seconds: 250, completed: true, found: 3, points: 2 })] }).success).toBe(true);
  });

  it("refuses what a paper sheet cannot say", () => {
    expect(problem({ trials: [trial({ participant: "Anna" })] })).toMatch(/never a name/);
    expect(problem({ trials: [trial({ task: "C" })] })).toMatch(/task/);
    expect(problem({ trials: [trial({ seconds: 901 })] })).toMatch(/seconds/);
    expect(problem({ trials: [trial({ points: 3, found: 2 })] })).toMatch(/points cannot be more than the results found/);
    expect(problem({ trials: [trial(), trial({ seconds: 600 })] })).toMatch(/the same tester, task and method is there twice/);
    expect(problem({ keyItems: { A: 1 }, trials: [trial({ points: 2 })] })).toMatch(/keyItems.A/);
    expect(problem({ trials: [] })).toMatch(/trials/);
  });

  it("puts by hand next to with the tool, per task and tester, task A first", () => {
    const results = TimedTestResults.parse({
      date: "2026-11-20",
      keyItems: { B: 5 },
      trials: [
        trial({ task: "B", method: "with_app", seconds: 410, completed: true, found: 4, points: 3 }),
        trial({ participant: "P10", method: "with_app", seconds: 120, completed: true, found: 1, points: 1 }),
        trial({ participant: "P2" }),
        trial(),
        trial({ method: "with_app", seconds: 250, completed: true, found: 3, points: 2 }),
      ],
    });
    const rows = summarizeTimedTest(results);
    expect(rows.map((r) => [r.task, r.participant])).toEqual([
      ["A", "P1"],
      ["A", "P2"],
      ["A", "P10"],
      ["B", "P1"],
    ]);
    expect(rows[0]).toEqual({
      task: "A",
      participant: "P1",
      keyItems: null,
      byHand: { seconds: 900, completed: false, found: 2, points: 1 },
      withTool: { seconds: 250, completed: true, found: 3, points: 2 },
    });
    expect(rows[3]).toMatchObject({ keyItems: 5, byHand: null, withTool: { points: 3 } });
  });

  it("writes one run as time and points", () => {
    expect(timedRunText({ seconds: 250, completed: true, found: 3, points: 2 }, null)).toBe("4 min 10 s, 2 points (3 results given)");
    expect(timedRunText({ seconds: 900, completed: false, found: 1, points: 1 }, 4)).toBe("15 min (not finished), 1 of 4 points (1 result given)");
    expect(timedRunText(null, null)).toBe("not run");
  });
});

describe("the staff-session results file", () => {
  const member = (overrides: Record<string, unknown> = {}) => ({ member: "embeddedart", claims: [], top5: [], ...overrides });
  const parse = (data: Record<string, unknown>) => StaffSessionResults.safeParse({ date: "2026-11-21", staff: 1, ...data });
  const problem = (data: Record<string, unknown>) => {
    const parsed = parse(data);
    return parsed.success ? "" : z.prettifyError(parsed.error);
  };

  it("refuses what a rating sheet cannot say", () => {
    expect(problem({ members: [member({ claims: [{ claim: 1, rating: "useful" }] })] })).toMatch(/rating/);
    expect(problem({ members: [member({ top5: [{ match: 6, rating: "relevant" }] })] })).toMatch(/match/);
    expect(problem({ members: [member({ claims: [{ claim: 1, rating: "right", rater: "Eva" }] })] })).toMatch(/never a name/);
    expect(problem({ members: [member({ member: "EmbeddedArt AB" })] })).toMatch(/company slug/);
    expect(problem({ members: [member(), member()] })).toMatch(/the same member is there twice/);
    expect(problem({ members: [member({ claims: [{ claim: 1, rating: "right" }, { claim: 1, rating: "wrong" }] })] })).toMatch(/the same claim from the same rater/);
    expect(problem({ members: [] })).toMatch(/members/);
    expect(problem({ members: [member()], quotes: [{ text: "Fine.", permission: "yes" }] })).toMatch(/permission/);
  });

  it("lets two staff rate the same sheet when each has a rater label", () => {
    const claims = [
      { claim: 1, rating: "right", rater: "S1" },
      { claim: 1, rating: "wrong", rater: "S2" },
    ];
    expect(parse({ members: [member({ claims })] }).success).toBe(true);
  });

  it("gives per member the share of claims right and of matches relevant, with the number rated, and shows only permitted quotes", () => {
    const results = StaffSessionResults.parse({
      date: "2026-11-21",
      staff: 2,
      members: [
        member({
          claims: [
            { claim: 1, rating: "right" },
            { claim: 2, rating: "right" },
            { claim: 3, rating: "wrong" },
            { claim: 4, rating: "unsure" },
          ],
          top5: [
            { match: 1, rating: "relevant" },
            { match: 2, rating: "not_relevant" },
          ],
        }),
        member({ member: "techinova", claims: [{ claim: 1, rating: "right" }] }),
      ],
      quotes: [
        { text: "Useful.", permission: true },
        { text: "Not for quoting.", permission: false },
      ],
    });
    expect(summarizeStaffSession(results)).toEqual({
      members: [
        { member: "embeddedart", claims: { rated: 4, good: 2, wrong: 1, unsure: 1 }, top5: { rated: 2, good: 1, notRelevant: 1 } },
        { member: "techinova", claims: { rated: 1, good: 1, wrong: 0, unsure: 0 }, top5: { rated: 0, good: 0, notRelevant: 0 } },
      ],
      total: { claims: { rated: 5, good: 3, wrong: 1, unsure: 1 }, top5: { rated: 2, good: 1, notRelevant: 1 } },
      quotes: ["Useful."],
      quotesWithheld: 1,
    });
  });

  it("writes a share with the number rated, or says nothing was rated", () => {
    expect(ratingText({ rated: 7, good: 5 })).toBe("5 of 7 (71%)");
    expect(ratingText({ rated: 0, good: 0 })).toBe("not rated");
  });

  it("has no quotes when the file lists none", () => {
    const results = StaffSessionResults.parse({ date: "2026-11-21", staff: 1, members: [member()] });
    expect(summarizeStaffSession(results)).toMatchObject({ quotes: [], quotesWithheld: 0 });
  });
});

describe("matchingResult", () => {
  const row = (mode: MatchCountRow["mode"], overrides: Partial<MatchCountRow> = {}): MatchCountRow => ({
    mode,
    companies: 1,
    ranked: 12,
    judged: 10,
    rejected: 4,
    lastJudgedAt: at("2026-11-14T19:00:00Z"),
    ...overrides,
  });
  const evalRun = (ranAt: string, rows: MatchCountRow[]) => run("matching", ranAt, JSON.parse(JSON.stringify(scoreMatching(rows).summary)));

  describe("with no matching eval stored: the viewer's own count", () => {
    it("is not measured while nothing is judged", () => {
      expect(matchingResult("staff", [], [])).toEqual({ status: "not_measured" });
      expect(matchingResult("member", [], [row("public", { judged: 0, rejected: 0, lastJudgedAt: null })])).toEqual({ status: "not_measured" });
    });

    it("works out kept and not judged yet, puts the public ranking first and dates it by the latest judgement", () => {
      const result = matchingResult("member", [], [row("personal", { lastJudgedAt: at("2026-11-14T19:20:00Z") }), row("public")]);
      expect(result).toMatchObject({ status: "measured", scope: "own_company", countedAt: null, lastJudgedAt: at("2026-11-14T19:20:00Z") });
      if (result.status !== "measured") return;
      expect(result.modes).toEqual([
        { mode: "public", companies: 1, ranked: 12, judged: 10, kept: 6, rejected: 4, notJudgedYet: 2 },
        { mode: "personal", companies: 1, ranked: 12, judged: 10, kept: 6, rejected: 4, notJudgedYet: 2 },
      ]);
    });

    it("says staff count every member's public ranking", () => {
      expect(matchingResult("staff", [], [row("public")])).toMatchObject({ scope: "all_members_public" });
    });
  });

  describe("with a matching eval stored: every member", () => {
    const totals = [row("personal", { companies: 56, ranked: 1120, judged: 1000, rejected: 300 }), row("public", { companies: 56, ranked: 1120, judged: 1120, rejected: 500, lastJudgedAt: at("2026-11-14T19:30:00Z") })];

    it("shows the latest run's totals to members and staff alike, with the run's date, not the viewer's own count", () => {
      const runs = [evalRun("2026-11-13T10:00:00Z", [row("public")]), evalRun("2026-11-14T20:00:00Z", totals)];
      for (const role of ["member", "staff"] as const) {
        const result = matchingResult(role, runs, [row("public")]);
        expect(result).toMatchObject({ status: "measured", scope: "all_members", countedAt: at("2026-11-14T20:00:00Z"), lastJudgedAt: at("2026-11-14T19:30:00Z") });
        if (result.status !== "measured") return;
        expect(result.modes).toEqual([
          { mode: "public", companies: 56, ranked: 1120, judged: 1120, kept: 620, rejected: 500, notJudgedYet: 0 },
          { mode: "personal", companies: 56, ranked: 1120, judged: 1000, kept: 700, rejected: 300, notJudgedYet: 120 },
        ]);
      }
    });

    it("shows zeros, not 'not measured', when the run found nothing judged", () => {
      const result = matchingResult("member", [evalRun("2026-11-14T20:00:00Z", [])], []);
      expect(result).toMatchObject({ status: "measured", scope: "all_members", lastJudgedAt: null });
    });

    it("keeps the date but no number when the run cannot be read", () => {
      const result = matchingResult("member", [run("matching", "2026-11-14T20:00:00Z", { modes: [{ mode: "public" }] })], [row("public")]);
      expect(result).toMatchObject({ status: "unreadable", ranAt: at("2026-11-14T20:00:00Z") });
    });
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
