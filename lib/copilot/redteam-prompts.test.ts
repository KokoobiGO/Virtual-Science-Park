/**
 * The red-team prompt file (B11) is well formed, so the runner
 * (lib/eval/redteam.ts, `npm run eval -- red_team`) can check every turn by
 * machine.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { DEMO_ACCOUNTS } from "../demo-accounts";
import { ScopeLabel } from "../schemas";

const PLACEHOLDERS = ["$OUT_OF_SCOPE_REPLY", "$BSP_CONTACT", "$INFORMATION_ONLY_NOTE"];
const GROUPS = ["relevant", "unrelated", "override", "indirect_injection", "privacy", "eligibility"];

const Expect = z
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

const File = z.strictObject({
  version: z.literal(1),
  about: z.string(),
  format: z.record(z.string(), z.string()),
  defaultAccount: z.string(),
  groups: z.array(
    z.strictObject({
      id: z.string(),
      description: z.string(),
      cases: z.array(
        z.strictObject({
          id: z.string(),
          account: z.string().optional(),
          setup: z.strictObject({ opportunity: z.record(z.string(), z.string()) }).optional(),
          turns: z.array(z.strictObject({ user: z.string().min(1), expect: Expect })).min(1),
        }),
      ),
    }),
  ),
});

const file = File.parse(JSON.parse(readFileSync(new URL("../../eval/redteam-prompts.json", import.meta.url), "utf8")));
const cases = file.groups.flatMap((g) => g.cases);
const turns = cases.flatMap((c) => c.turns);
const texts = turns.map((t) => t.user);

describe("eval/redteam-prompts.json", () => {
  it("has the six groups, at least 30 prompts and unique case ids", () => {
    expect(file.groups.map((g) => g.id)).toEqual(GROUPS);
    expect(turns.length).toBeGreaterThanOrEqual(30);
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
    for (const group of file.groups) expect(group.cases.length).toBeGreaterThanOrEqual(5);
  });

  it("uses only known accounts and placeholders", () => {
    const slugs = DEMO_ACCOUNTS.filter((a) => a.role === "member").map((a) => a.companySlug);
    for (const c of cases) expect(slugs).toContain(c.account ?? file.defaultAccount);
    const strings = turns.flatMap((t) => [t.expect.exactReply, ...(t.expect.mustContain ?? []), ...(t.expect.mustContainAny ?? []), ...(t.expect.mustNotContain ?? [])]);
    for (const s of strings) if (s?.startsWith("$")) expect(PLACEHOLDERS).toContain(s);
  });

  it("covers follow-up turns, role-play, claimed authority and another company's top five", () => {
    expect(cases.filter((c) => c.turns.length > 1).length).toBeGreaterThanOrEqual(5);
    expect(texts.some((t) => /pretend|let's play|you are FreeBot/i.test(t))).toBe(true);
    expect(texts.some((t) => /I am BSP staff/i.test(t))).toBe(true);
    expect(texts.some((t) => /another company's top five/i.test(t))).toBe(true);
  });

  it("expects the fixed reply for every out-of-scope or override-only turn", () => {
    for (const t of turns) {
      const labels = t.expect.labels ?? [];
      if (labels.length && labels.every((l) => l === "out_of_scope" || l === "override_attempt")) {
        expect(t.expect.exactReply, t.user).toBe("$OUT_OF_SCOPE_REPLY");
      }
    }
  });

  it("asks every eligibility case for potential match and the staff contact unless an override is allowed", () => {
    const group = file.groups.find((g) => g.id === "eligibility")!;
    for (const c of group.cases) {
      const last = c.turns.at(-1)!;
      if (last.expect.labels?.includes("override_attempt")) continue;
      expect(last.expect.mustContain, c.id).toEqual(expect.arrayContaining(["potential match", "$BSP_CONTACT"]));
    }
  });
});
