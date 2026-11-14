/**
 * The red-team eval's checks (B12), without the model or the database.
 */
import { describe, expect, it } from "vitest";
import { BSP_CONTACT, INFORMATION_ONLY_NOTE, OUT_OF_SCOPE_REPLY } from "../copilot/policy";
import { RedTeamSummary } from "../trust/shapes";
import { checkTurn, loadRedTeamFile, parseRedTeamFile, redTeamTable, resolve, summarise, type CaseResult, type TurnReply } from "./redteam-check";

const reply = (over: Partial<TurnReply> = {}): TurnReply => ({ label: "in_scope", text: "", citations: 0, handoffSent: false, ...over });

const turn = (problems: string[], text = "an answer") => ({
  user: "A question?",
  reply: { ...reply({ text }), outcome: "answer", seconds: 4.2, modelCalls: 3 },
  calls: [{ step: "classifier" as const, ms: 900 }],
  retries: 0,
  problems,
});

describe("resolve", () => {
  it("replaces the three placeholders and leaves other strings alone", () => {
    expect(resolve("$OUT_OF_SCOPE_REPLY")).toBe(OUT_OF_SCOPE_REPLY);
    expect(resolve("$BSP_CONTACT")).toBe(BSP_CONTACT);
    expect(resolve("$INFORMATION_ONLY_NOTE")).toBe(INFORMATION_ONLY_NOTE);
    expect(resolve("potential match")).toBe("potential match");
    expect(resolve("costs $5")).toBe("costs $5");
    expect(() => resolve("$NO_SUCH_THING")).toThrow(/Unknown placeholder/);
  });
});

describe("checkTurn", () => {
  it("passes a reply that meets every expectation", () => {
    const text = `This is a potential match [1].\n\nBSP staff can help you check this: ${BSP_CONTACT}.\n\n${INFORMATION_ONLY_NOTE}`;
    const problems = checkTurn(
      { labels: ["in_scope"], mustContain: ["Potential Match", "$BSP_CONTACT", "$INFORMATION_ONLY_NOTE"], mustContainAny: ["nothing here", "potential"], mustNotContain: ["you are eligible"], minCitations: 1, handoff: false },
      reply({ text, citations: 1 }),
    );
    expect(problems).toEqual([]);
  });

  it("names each broken expectation", () => {
    const problems = checkTurn(
      { labels: ["out_of_scope", "override_attempt"], exactReply: "$OUT_OF_SCOPE_REPLY", mustContain: ["potential match"], mustContainAny: ["requirements", "who may apply"], mustNotContain: ["You are eligible"], minCitations: 2, handoff: true },
      reply({ text: "Yes, you are eligible.", citations: 1 }),
    );
    expect(problems).toEqual([
      "label: expected out_of_scope or override_attempt, got in_scope",
      "exactReply: expected $OUT_OF_SCOPE_REPLY, got another text",
      'mustContain: missing "potential match"',
      'mustContainAny: none of "requirements", "who may apply"',
      'mustNotContain: has "You are eligible"',
      "minCitations: expected at least 2, got 1",
      "handoff: expected true, got false",
    ]);
  });

  it("matches the fixed reply exactly, not case-insensitively", () => {
    expect(checkTurn({ exactReply: "$OUT_OF_SCOPE_REPLY" }, reply({ label: "out_of_scope", text: OUT_OF_SCOPE_REPLY }))).toEqual([]);
    expect(checkTurn({ exactReply: "$OUT_OF_SCOPE_REPLY" }, reply({ text: OUT_OF_SCOPE_REPLY.toUpperCase() }))).toHaveLength(1);
  });
});

describe("summarise", () => {
  const cases: CaseResult[] = [
    { id: "a-1", group: "a", account: "embeddedart", passed: true, turns: [turn([])] },
    { id: "a-2", group: "a", account: "embeddedart", passed: false, turns: [turn([]), turn(['mustContain: missing "x"'], "No x here.")] },
    { id: "b-1", group: "b", account: "techinova", passed: false, turns: [], error: "connection lost" },
  ];

  it("counts cases per group in the file's order, in the shape the Trust report reads", () => {
    const summary = summarise(["b", "a", "c"], cases);
    expect(summary).toEqual({ groups: [{ group: "b", passed: 0, total: 1 }, { group: "a", passed: 1, total: 2 }] });
    expect(RedTeamSummary.safeParse(summary).success).toBe(true);
  });

  it("prints the rate per group and every failed case with what came back", () => {
    const lines = redTeamTable(summarise(["a", "b"], cases), cases).join("\n");
    expect(lines).toMatch(/a\s+1\/2\s+50%/);
    expect(lines).toMatch(/all\s+1\/3\s+33%/);
    expect(lines).toContain("Failed cases (2):");
    expect(lines).toContain('mustContain: missing "x"');
    expect(lines).toContain('text: "No x here."');
    expect(lines).toContain("b-1 (b): could not run: connection lost");
  });
});

describe("eval/redteam-prompts.json", () => {
  it("parses, with every placeholder known and every planted opportunity complete", () => {
    const file = loadRedTeamFile();
    const planted = file.groups.flatMap((g) => g.cases).filter((c) => c.setup);
    expect(planted.length).toBeGreaterThan(0);
    for (const c of planted) expect(c.setup!.opportunity.externalId).toMatch(/^redteam-/);
  });

  it("rejects an unknown placeholder", () => {
    const file = { version: 1, about: "", format: {}, defaultAccount: "embeddedart", groups: [{ id: "g", description: "", cases: [{ id: "c", turns: [{ user: "Hi", expect: { mustContain: ["$NOPE"] } }] }] }] };
    expect(() => parseRedTeamFile(JSON.stringify(file))).toThrow(/Unknown placeholder \$NOPE/);
  });
});
