import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLASSIFIER_SYSTEM_PROMPT } from "./classifier";
import { BSP_CONTACT, bspContact, NO_CONTACT_ADDRESS, OUT_OF_SCOPE_REPLY, renderScopePolicyDoc, STAFF_TOPICS, SUPPORTED_TOPICS } from "./policy";
import { buildAssistantSystemPrompt } from "./prompt";

describe("scope policy (B2)", () => {
  it("docs/scope-policy.md is rendered from policy.ts (run `npx tsx lib/copilot/write-policy-doc.ts` after a change)", () => {
    const doc = readFileSync(new URL("../../docs/scope-policy.md", import.meta.url), "utf8").replace(/\r\n/g, "\n");
    expect(doc).toBe(renderScopePolicyDoc());
  });

  it("the fixed reply is one sentence", () => {
    expect(OUT_OF_SCOPE_REPLY.match(/[.!?](\s|$)/g)).toHaveLength(1);
  });

  it("both prompts are built from the same text", () => {
    const assistant = buildAssistantSystemPrompt({ companyName: "EmbeddedArt", today: new Date("2026-11-14T12:00:00Z") });
    for (const topic of SUPPORTED_TOPICS) {
      expect(CLASSIFIER_SYSTEM_PROMPT).toContain(topic);
      expect(assistant).toContain(topic);
    }
    for (const topic of STAFF_TOPICS) expect(assistant).toContain(topic);
    expect(assistant).toContain(OUT_OF_SCOPE_REPLY);
    expect(assistant).toContain(BSP_CONTACT);
    expect(assistant).toContain("Today is 2026-11-14.");
  });

  it("the staff contact comes from BSP_CONTACT_EMAIL", () => {
    expect(bspContact("staff@example.org")).toBe("staff@example.org");
    expect(bspContact("  staff@example.org \n")).toBe("staff@example.org");
    expect(BSP_CONTACT).toBe(bspContact(process.env.BSP_CONTACT_EMAIL));
  });

  it("without a real address it says 'ask BSP staff' and gives no address, never the old placeholder", () => {
    for (const unset of [undefined, "", "   ", "not an address", "bsp-staff@PLACEHOLDER.invalid", "staff@example.invalid"]) {
      expect(bspContact(unset), String(unset)).toBe(NO_CONTACT_ADDRESS);
    }
    expect(NO_CONTACT_ADDRESS).toBe("ask BSP staff");
    expect(NO_CONTACT_ADDRESS).not.toContain("@");
    expect(BSP_CONTACT).not.toMatch(/PLACEHOLDER|\.invalid/i);
    expect(renderScopePolicyDoc()).not.toMatch(/PLACEHOLDER|\.invalid/i);
  });
});
