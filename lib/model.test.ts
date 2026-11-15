import type Anthropic from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { judgeJsonSchema } from "./judge/output";
import { fromClaudeMessage, MODEL_FOR, MODELS, modelChat, ModelApiError, toClaudeMessages, toClaudeRequest, type ChatMessage, type ToolDefinition } from "./model";
import { profilerJsonSchema } from "./profiler/output";
import { writerJsonSchema } from "./scout/prompt";
import { taggerJsonSchema } from "./tagger/output";
import { trendJsonSchema } from "./trends/write";

const searchTool: ToolDefinition = {
  type: "function",
  function: { name: "search", description: "Search the store.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
};

const call = { id: "toolu_1", type: "function" as const, function: { name: "search", arguments: '{"query":"sonar"}' } };

function claudeMessage(content: unknown[], stop_reason = "end_turn", usage: Record<string, number> = { input_tokens: 10, output_tokens: 5 }) {
  return { id: "msg_1", type: "message", role: "assistant", model: MODELS.sonnet, content, stop_reason, usage } as unknown as Anthropic.Beta.BetaMessage;
}

describe("toClaudeMessages", () => {
  it("moves system text to `system` and puts tool results in one user turn", () => {
    const { system, messages } = toClaudeMessages([
      { role: "system", content: "Be brief." },
      { role: "user", content: "Find sonar tests." },
      { role: "assistant", content: null, tool_calls: [call, { ...call, id: "toolu_2" }] },
      { role: "tool", tool_call_id: "toolu_1", content: "R1 Sonar range" },
      { role: "tool", tool_call_id: "toolu_2", content: "" },
      { role: "user", content: "Call one of the tools." },
    ]);
    expect(system).toBe("Be brief.");
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(messages[1].content).toEqual([
      { type: "tool_use", id: "toolu_1", name: "search", input: { query: "sonar" } },
      { type: "tool_use", id: "toolu_2", name: "search", input: { query: "sonar" } },
    ]);
    // Both results, then the nudge, in the one user turn; an empty result is never sent empty.
    expect(messages[2].content).toEqual([
      { type: "tool_result", tool_use_id: "toolu_1", content: "R1 Sonar range" },
      { type: "tool_result", tool_use_id: "toolu_2", content: "(empty)" },
      { type: "text", text: "Call one of the tools." },
    ]);
  });

  it("sends Claude's own blocks back unchanged, thinking included", () => {
    const blocks = [
      { type: "thinking", thinking: "Search first.", signature: "sig" },
      { type: "tool_use", id: "toolu_1", name: "search", input: { query: "sonar" } },
    ];
    const { messages } = toClaudeMessages([
      { role: "user", content: "Find sonar tests." },
      { role: "assistant", content: null, tool_calls: [call], blocks },
      { role: "tool", tool_call_id: "toolu_1", content: "R1" },
    ]);
    expect(messages[1].content).toEqual(blocks);
  });

  it("builds the blocks itself when the stored ones miss a tool call", () => {
    const written = { id: "text_call_0", type: "function" as const, function: { name: "search", arguments: "not json" } };
    const { messages } = toClaudeMessages([
      { role: "user", content: "Q" },
      { role: "assistant", content: "Looking.", tool_calls: [written], blocks: [{ type: "text", text: "Looking." }] },
      { role: "tool", tool_call_id: "text_call_0", content: "R1" },
    ]);
    expect(messages[1].content).toEqual([
      { type: "text", text: "Looking." },
      { type: "tool_use", id: "text_call_0", name: "search", input: {} },
    ]);
  });

  it("leaves out an assistant turn with no text and no calls", () => {
    const history: ChatMessage[] = [
      { role: "user", content: "Q" },
      { role: "assistant", content: "" },
      { role: "user", content: "Answer now." },
    ];
    const { messages } = toClaudeMessages(history);
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toHaveLength(2);
  });
});

describe("toClaudeRequest", () => {
  const base = { messages: [{ role: "user" as const, content: "Hi" }] };

  it("turns thinking off the way each model takes it", () => {
    expect(toClaudeRequest({ ...base, model: MODELS.haiku }).thinking).toEqual({ type: "disabled" });
    expect(toClaudeRequest({ ...base, model: MODELS.sonnet }).thinking).toEqual({ type: "between_tools" });
    expect(toClaudeRequest({ ...base, model: MODELS.sonnet, thinking: true }).thinking).toEqual({ type: "adaptive" });
  });

  it("asks for the refusal fallback on Sonnet only, and never sends sampling settings", () => {
    const sonnet = toClaudeRequest({ ...base, model: MODELS.sonnet });
    expect(sonnet).toMatchObject({ betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
    const haiku = toClaudeRequest({ ...base, model: MODELS.haiku });
    expect(haiku).not.toHaveProperty("fallbacks");
    expect(haiku).not.toHaveProperty("betas");
    for (const request of [sonnet, haiku]) expect(request).not.toHaveProperty("temperature");
  });

  it("maps tools, tool choice, effort, caching and the answer schema", () => {
    const request = toClaudeRequest({
      ...base,
      model: MODELS.sonnet,
      max_tokens: 700,
      effort: "low",
      tools: [searchTool],
      tool_choice: "none",
      cache: true,
      response_format: { type: "json_schema", json_schema: { name: "brief", schema: writerJsonSchema(["R1"]), strict: true } },
    });
    expect(request.max_tokens).toBe(700);
    expect(request.tools).toEqual([{ name: "search", description: "Search the store.", input_schema: searchTool.function.parameters }]);
    expect(request.tool_choice).toEqual({ type: "none" });
    expect(request.cache_control).toEqual({ type: "ephemeral" });
    expect(request.output_config?.effort).toBe("low");
    const schema = JSON.stringify(request.output_config?.format?.schema);
    // Kept: the closed set of source ids. Moved to a description: what structured outputs do not enforce.
    expect(schema).toContain('"enum":["R1"]');
    expect(schema).not.toContain('"maxItems"');
    expect(schema).not.toContain('"$schema"');
  });

  it("accepts every answer schema the app sends", () => {
    const schemas = [judgeJsonSchema(["M1", "M2"]), profilerJsonSchema(), writerJsonSchema(["R1", "R2"]), taggerJsonSchema(["T1"]), trendJsonSchema(["S1", "S2"])];
    for (const schema of schemas) {
      const request = toClaudeRequest({ ...base, model: MODELS.haiku, response_format: { type: "json_schema", json_schema: { name: "x", schema } } });
      expect(request.output_config?.format?.type).toBe("json_schema");
    }
  });

  it("gives each step a model, Haiku for the narrow ones and Sonnet where more judgment is needed", () => {
    expect([MODEL_FOR.classifier, MODEL_FOR.tagger, MODEL_FOR.judge].map((s) => s.model)).toEqual([MODELS.haiku, MODELS.haiku, MODELS.haiku]);
    const sonnet = [MODEL_FOR.profiler, MODEL_FOR.connections, MODEL_FOR.trends, MODEL_FOR.scout, MODEL_FOR.copilot];
    expect(sonnet.every((s) => s.model === MODELS.sonnet)).toBe(true);
  });
});

describe("fromClaudeMessage", () => {
  it("gives back the text, the tool calls, the blocks and every input token", () => {
    const content = [
      { type: "thinking", thinking: "", signature: "sig" },
      { type: "text", text: "Searching." },
      { type: "tool_use", id: "toolu_9", name: "search", input: { query: "sonar" } },
    ];
    const response = fromClaudeMessage(claudeMessage(content, "tool_use", { input_tokens: 100, cache_read_input_tokens: 900, cache_creation_input_tokens: 50, output_tokens: 20 }));
    const choice = response.choices[0];
    expect(choice.finish_reason).toBe("tool_calls");
    expect(choice.message.content).toBe("Searching.");
    expect(choice.message.tool_calls).toEqual([{ id: "toolu_9", type: "function", function: { name: "search", arguments: '{"query":"sonar"}' } }]);
    expect(choice.message.blocks).toEqual(content);
    expect(response.usage).toEqual({ prompt_tokens: 1050, completion_tokens: 20, total_tokens: 1070 });
  });

  it("names the stop reasons the callers check", () => {
    expect(fromClaudeMessage(claudeMessage([{ type: "text", text: "{" }], "max_tokens")).choices[0].finish_reason).toBe("length");
    expect(fromClaudeMessage(claudeMessage([], "refusal")).choices[0]).toMatchObject({ finish_reason: "refusal", message: { content: null } });
  });
});

describe("modelChat", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("calls the Messages API and answers in the chat format", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json(claudeMessage([{ type: "text", text: "OK" }])));
    vi.stubGlobal("fetch", fetchMock);
    const response = await modelChat({ model: MODELS.haiku, messages: [{ role: "user", content: "Say OK" }] });
    expect(response.choices[0].message.content).toBe("OK");
    expect(String(fetchMock.mock.calls[0][0])).toContain("/v1/messages");
  });

  it("throws ModelApiError with the status on an HTTP error", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        Response.json({ type: "error", error: { type: "rate_limit_error", message: "Too many requests" } }, { status: 429, headers: { "x-should-retry": "false" } }),
      ),
    );
    const error = await modelChat({ model: MODELS.haiku, messages: [{ role: "user", content: "Hi" }] }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ModelApiError);
    expect((error as ModelApiError).status).toBe(429);
  });

  it("throws a TimeoutError when no answer comes in time", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(
        (_url, init) =>
          new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")))),
      ),
    );
    const error = await modelChat({ model: MODELS.haiku, messages: [{ role: "user", content: "Hi" }] }, { timeoutMs: 50 }).catch((e: unknown) => e);
    expect((error as Error).name).toBe("TimeoutError");
  });

  it("refuses to call without a key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    await expect(modelChat({ model: MODELS.haiku, messages: [{ role: "user", content: "Hi" }] })).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });
});
