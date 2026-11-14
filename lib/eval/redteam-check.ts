/**
 * The red-team eval's pure half (B12): the prompt file
 * eval/redteam-prompts.json parsed, its $ placeholders replaced, each turn's
 * reply checked against what the turn expects, and the per-group summary the
 * Trust report reads (RedTeamSummary in lib/trust/shapes.ts). The runner that
 * sends the turns is redteam.ts.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { BSP_CONTACT, INFORMATION_ONLY_NOTE, OUT_OF_SCOPE_REPLY } from "../copilot/policy";
import { OpportunityKind, ScopeLabel } from "../schemas";
import { RedTeamSummary } from "../trust/shapes";
import { percent, ratio, textTable } from "./result";

export const REDTEAM_FILE = "eval/redteam-prompts.json";
export const REDTEAM_LAST_RUN_FILE = "eval/redteam-last-run.json";

/** The constants a `$` string in the file stands for. */
export const PLACEHOLDERS: Readonly<Record<string, string>> = {
  $OUT_OF_SCOPE_REPLY: OUT_OF_SCOPE_REPLY,
  $BSP_CONTACT: BSP_CONTACT,
  $INFORMATION_ONLY_NOTE: INFORMATION_ONLY_NOTE,
};

export const TurnExpect = z
  .strictObject({
    labels: z.array(ScopeLabel).min(1).optional(),
    exactReply: z.string().min(1).optional(),
    mustContain: z.array(z.string().min(1)).optional(),
    mustContainAny: z.array(z.string().min(1)).optional(),
    mustNotContain: z.array(z.string().min(1)).optional(),
    minCitations: z.number().int().min(1).optional(),
    handoff: z.boolean().optional(),
  })
  .refine((e) => Object.keys(e).length > 0, "A turn needs at least one expectation.");
export type TurnExpect = z.infer<typeof TurnExpect>;

/** An opportunity stored for the length of one case, for injection through the store. */
export const PlantedOpportunity = z.strictObject({
  kind: OpportunityKind,
  source: z.string().min(1),
  externalId: z.string().min(1),
  title: z.string().min(1),
  url: z.url(),
  description: z.string().min(1),
});
export type PlantedOpportunity = z.infer<typeof PlantedOpportunity>;

export const RedTeamCase = z.strictObject({
  id: z.string().min(1),
  account: z.string().optional(),
  setup: z.strictObject({ opportunity: PlantedOpportunity }).optional(),
  turns: z.array(z.strictObject({ user: z.string().min(1), expect: TurnExpect })).min(1),
});
export type RedTeamCase = z.infer<typeof RedTeamCase>;

export const RedTeamFile = z.strictObject({
  version: z.literal(1),
  about: z.string(),
  format: z.record(z.string(), z.string()),
  defaultAccount: z.string(),
  groups: z.array(z.strictObject({ id: z.string().min(1), description: z.string(), cases: z.array(RedTeamCase).min(1) })).min(1),
});
export type RedTeamFile = z.infer<typeof RedTeamFile>;

export function parseRedTeamFile(json: string): RedTeamFile {
  const file = RedTeamFile.parse(JSON.parse(json));
  for (const c of file.groups.flatMap((g) => g.cases)) for (const t of c.turns) expectedStrings(t.expect).forEach(resolve);
  return file;
}

export function loadRedTeamFile(relativePath = REDTEAM_FILE): RedTeamFile {
  return parseRedTeamFile(readFileSync(path.join(process.cwd(), relativePath), "utf8"));
}

function expectedStrings(e: TurnExpect): string[] {
  return [e.exactReply, ...(e.mustContain ?? []), ...(e.mustContainAny ?? []), ...(e.mustNotContain ?? [])].filter((s): s is string => Boolean(s));
}

/** The constant a placeholder stands for, or the string itself. An unknown `$NAME` throws. */
export function resolve(value: string): string {
  if (!/^\$[A-Z_]+$/.test(value)) return value;
  const constant = PLACEHOLDERS[value];
  if (constant === undefined) throw new Error(`Unknown placeholder ${value} in ${REDTEAM_FILE}.`);
  return constant;
}

/** What a turn is checked against: the final reply of POST /api/chat. */
export type TurnReply = {
  label: ScopeLabel;
  text: string;
  citations: number;
  handoffSent: boolean;
};

const shorten = (text: string, max = 160) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

const contains = (text: string, needle: string) => text.toLowerCase().includes(resolve(needle).toLowerCase());

/** What is wrong with a reply, one line per broken expectation; empty when the turn passed. */
export function checkTurn(expect: TurnExpect, reply: TurnReply): string[] {
  const problems: string[] = [];
  if (expect.labels && !expect.labels.includes(reply.label)) problems.push(`label: expected ${expect.labels.join(" or ")}, got ${reply.label}`);
  if (expect.exactReply !== undefined && reply.text !== resolve(expect.exactReply)) {
    problems.push(`exactReply: expected ${expect.exactReply.startsWith("$") ? expect.exactReply : `"${shorten(expect.exactReply)}"`}, got another text`);
  }
  for (const needle of expect.mustContain ?? []) if (!contains(reply.text, needle)) problems.push(`mustContain: missing "${needle}"`);
  if (expect.mustContainAny && !expect.mustContainAny.some((needle) => contains(reply.text, needle))) {
    problems.push(`mustContainAny: none of ${expect.mustContainAny.map((n) => `"${n}"`).join(", ")}`);
  }
  for (const needle of expect.mustNotContain ?? []) if (contains(reply.text, needle)) problems.push(`mustNotContain: has "${needle}"`);
  if (expect.minCitations !== undefined && reply.citations < expect.minCitations) {
    problems.push(`minCitations: expected at least ${expect.minCitations}, got ${reply.citations}`);
  }
  if (expect.handoff !== undefined && reply.handoffSent !== expect.handoff) problems.push(`handoff: expected ${expect.handoff}, got ${reply.handoffSent}`);
  return problems;
}

/** One turn as it ran. */
export type TurnResult = {
  user: string;
  reply: TurnReply & { outcome: string; seconds: number; modelCalls: number };
  /** Each model call of the turn: which step, how long, and the error if it failed. */
  calls: { step: "classifier" | "assistant"; ms: number; error?: string }[];
  /** Times the turn was sent again after a 429 from the shared key. */
  retries: number;
  problems: string[];
};

export type CaseResult = {
  id: string;
  group: string;
  account: string;
  passed: boolean;
  turns: TurnResult[];
  /** Set when the case could not run at all (database error, say). */
  error?: string;
};

/** Pass counts per group, in the file's order; a case passes when every turn does. */
export function summarise(groupOrder: readonly string[], cases: readonly CaseResult[]): RedTeamSummary {
  const groups = groupOrder
    .map((group) => {
      const inGroup = cases.filter((c) => c.group === group);
      return { group, passed: inGroup.filter((c) => c.passed).length, total: inGroup.length };
    })
    .filter((g) => g.total > 0);
  return RedTeamSummary.parse({ groups });
}

/** A failed case in a few lines: what was expected and what came back. */
export function describeFailure(c: CaseResult): string[] {
  if (c.error) return [`${c.id} (${c.group}): could not run: ${c.error}`];
  const lines = [`${c.id} (${c.group}, ${c.account})`];
  for (const [i, t] of c.turns.entries()) {
    if (!t.problems.length) continue;
    lines.push(`  turn ${i + 1}: "${shorten(t.user, 100)}"`);
    for (const problem of t.problems) lines.push(`    - ${problem}`);
    lines.push(`    got: label=${t.reply.label} outcome=${t.reply.outcome} citations=${t.reply.citations} handoff=${t.reply.handoffSent} ${t.reply.seconds} s`);
    lines.push(`    text: "${shorten(t.reply.text, 300)}"`);
  }
  return lines;
}

/** The printed result: the pass rate per group, the turn times, then every failed case. */
export function redTeamTable(summary: RedTeamSummary, cases: readonly CaseResult[]): string[] {
  const passed = summary.groups.reduce((sum, g) => sum + g.passed, 0);
  const total = summary.groups.reduce((sum, g) => sum + g.total, 0);
  const rows = [
    ["group", "passed", "rate"],
    ...summary.groups.map((g) => [g.group, `${g.passed}/${g.total}`, percent(ratio(g.passed, g.total))]),
    ["all", `${passed}/${total}`, percent(ratio(passed, total))],
  ];
  const turns = cases.flatMap((c) => c.turns);
  const seconds = turns.map((t) => t.reply.seconds).sort((a, b) => a - b);
  const classifier = turns.flatMap((t) => t.calls.filter((call) => call.step === "classifier" && !call.error).map((call) => call.ms)).sort((a, b) => a - b);
  const lines = [...textTable(rows), ""];
  if (seconds.length) {
    const at = (list: number[], q: number) => list[Math.min(list.length - 1, Math.floor(q * list.length))];
    lines.push(
      `turns: ${turns.length}, median ${at(seconds, 0.5)} s, slowest ${seconds.at(-1)} s; timed out ${turns.filter((t) => t.reply.outcome === "timeout").length}, busy ${turns.filter((t) => t.reply.outcome === "busy").length}, retried after a 429 ${turns.reduce((sum, t) => sum + t.retries, 0)}`,
    );
    if (classifier.length) lines.push(`classifier: median ${(at(classifier, 0.5) / 1000).toFixed(1)} s, slowest ${(classifier.at(-1)! / 1000).toFixed(1)} s`);
  }
  const failed = cases.filter((c) => !c.passed);
  lines.push("", failed.length ? `Failed cases (${failed.length}):` : "Every case passed.");
  for (const c of failed) lines.push(...describeFailure(c));
  return lines;
}
