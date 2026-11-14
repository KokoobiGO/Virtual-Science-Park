/**
 * Tool calls the model writes into its text (Nemotron 3.5 does now and then):
 * read as calls, and never shown to the member.
 */
import { describe, expect, it } from "vitest";
import { cleanReply, textToolCalls } from "./assistant";

const args = (content: string) => textToolCalls(content).map((c) => [c.function.name, JSON.parse(c.function.arguments)]);

describe("textToolCalls", () => {
  it("reads the <function=...> <parameter=...> form, also with a missing </parameter>", () => {
    const content =
      "<tool_call> <function=searchOpportunities> <parameter=query> sensor systems development </parameter> <parameter=kind> funding </function> </tool_call>";
    expect(args(content)).toEqual([["searchOpportunities", { query: "sensor systems development", kind: "funding" }]]);
    expect(textToolCalls(content)[0]).toMatchObject({ id: "text_call_0", type: "function" });
  });

  it("reads JSON bodies, array parameters and several calls", () => {
    const content = [
      '<tool_call>{"name": "explainMatch", "arguments": {"title": "FMV"}}</tool_call>',
      '<tool_call><function=searchOpportunities><parameter=query>sonar</parameter><parameter=tags>["marine", "sensor"]</parameter></function></tool_call>',
      "<TOOLCALL>getMyProfile</TOOLCALL>",
    ].join("\n");
    expect(args(content)).toEqual([
      ["explainMatch", { title: "FMV" }],
      ["searchOpportunities", { query: "sonar", tags: ["marine", "sensor"] }],
    ]);
  });

  it("finds nothing in plain text", () => {
    expect(textToolCalls("The Baltic Marine Watchdog Challenge closes on 2026-12-08 [1].")).toEqual([]);
    expect(textToolCalls(null)).toEqual([]);
  });
});

describe("cleanReply", () => {
  it("drops thinking and tool calls written as text, closed or not", () => {
    expect(cleanReply("<think>hmm</think>Hello [1].")).toBe("Hello [1].");
    expect(cleanReply("Answer [1].\n<tool_call> <function=searchOpportunities> <parameter=query> x </parameter> </function> </tool_call>")).toBe("Answer [1].");
    expect(cleanReply("Answer [1]. <tool_call> <function=searchOpportunities> <parameter=query> x")).toBe("Answer [1].");
    expect(cleanReply("<function=getMyProfile> </function>")).toBe("");
  });
});
