/**
 * The model layer (S2, S3). Every model call in the app goes through modelChat(),
 * on Claude: Haiku 5.5 for the quick, high-volume steps and Sonnet 5.5 for the
 * steps that need more judgment. MODEL_FOR below says which step uses which.
 *
 * Callers speak one small chat format (system, user, assistant and tool
 * messages; function tools; a JSON schema for the answer). modelChat() turns it
 * into a Claude Messages request with the official SDK and turns the answer
 * back, so the agents, their tests and the stored Inngest steps do not depend
 * on the provider. The app ran on NVIDIA's free API in this format before
 * 2026-11-15.
 *
 * Thinking is off unless a request asks for it: every step's prompt, token
 * cap and time limit was tuned with it off. Haiku turns it off with
 * {type: "disabled"}; Sonnet 5.5 rejects that and takes {type: "between_tools"}.
 * A tool loop must send back the blocks Claude returned, thinking blocks
 * included, unchanged: the assistant message carries them in `blocks`.
 * Sonnet requests carry the server-side refusal fallback (fallbacks:
 * "default"); Haiku has none. Run `npm run check:models` to test the key.
 */
import Anthropic from "@anthropic-ai/sdk";
import { transformJSONSchema } from "@anthropic-ai/sdk/lib/transform-json-schema";

export const MODELS = {
  haiku: "claude-haiku-5-5",
  sonnet: "claude-sonnet-5-5",
} as const;

/** `low` up to `high`: higher levels need thinking on, and every step runs with it off. */
export type Effort = "low" | "medium" | "high";

/**
 * Which model each step uses. Haiku where the task is narrow and the volume
 * high; Sonnet where members read the result or the step reasons over many
 * sources.
 */
export const MODEL_FOR = {
  /** Copilot's scope label: one of four labels on every turn, inside the 23 s turn budget. */
  classifier: { model: MODELS.haiku, effort: "low" },
  /** Interest tags per text, in batches. */
  tagger: { model: MODELS.haiku, effort: "low" },
  /** Keep or reject per match, five matches a call, about 1,400 calls a full run. */
  judge: { model: MODELS.haiku, effort: "medium" },
  /** The company profile with word-for-word quotes; the Trust report measures its accuracy. */
  profiler: { model: MODELS.sonnet, effort: "medium" },
  /** Whether two members could work together, and why, with cited claims. */
  connections: { model: MODELS.sonnet, effort: "medium" },
  /** The weekly trend note members read. */
  trends: { model: MODELS.sonnet, effort: "medium" },
  /** Scout's research loop and the brief it writes. */
  scout: { model: MODELS.sonnet, effort: "medium" },
  /** Copilot's answer with tools and citations, inside the 23 s turn budget. */
  copilot: { model: MODELS.sonnet, effort: "low" },
} as const satisfies Record<string, { model: string; effort: Effort }>;

/** Server-side refusal fallback for Sonnet 5.5: a declined request is retried on a fallback model inside the same call. */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01" as const;

export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  /** `blocks`: Claude's content blocks as returned, sent back unchanged in a tool loop. */
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[]; blocks?: unknown[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type ToolDefinition = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export type ChatRequest = {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  /** Default `medium`. */
  effort?: Effort;
  /** Adaptive thinking. Off by default; thinking counts toward max_tokens and adds time. */
  thinking?: boolean;
  tools?: ToolDefinition[];
  /** Sonnet 5.5 rejects forced tool use, so only these two. */
  tool_choice?: "auto" | "none";
  /** The answer as JSON in this schema (Claude's structured outputs). */
  response_format?: { type: "json_schema"; json_schema: { name: string; schema: Record<string, unknown>; strict?: boolean } };
  /** Cache the prompt: for tool loops, which send the same start again on every call. */
  cache?: boolean;
};

export type ChatResponse = {
  model: string;
  choices: {
    /** "stop", "tool_calls", "length" (max_tokens) or "refusal". */
    finish_reason: string | null;
    message: { role: "assistant"; content: string | null; tool_calls?: ToolCall[]; blocks?: unknown[] };
  }[];
  /** prompt_tokens counts cached input too. */
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
};

/** An HTTP error from the model API: 429 is a rate limit, 529 an overloaded API. */
export class ModelApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(`Claude API ${status}: ${message.slice(0, 300)}`);
  }
}

export const isRateLimit = (error: unknown) => error instanceof ModelApiError && error.status === 429;

let client: Anthropic | undefined;

/**
 * One client per process. It talks to the public API unless
 * ANTHROPIC_API_BASE_URL says otherwise; the SDK's own ANTHROPIC_BASE_URL is
 * ignored on purpose, because developer tools sometimes set it for themselves.
 */
export function getAnthropic(): Anthropic {
  client ??= new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    baseURL: process.env.ANTHROPIC_API_BASE_URL || "https://api.anthropic.com",
    // The global fetch at call time, not at construction: tests replace it per test.
    fetch: (url, init) => globalThis.fetch(url, init),
  });
  return client;
}

type Block = Anthropic.Beta.BetaContentBlockParam;

function parseArguments(text: string): Record<string, unknown> {
  try {
    const value = JSON.parse(text || "{}") as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function assistantBlocks(message: Extract<ChatMessage, { role: "assistant" }>): Block[] {
  const calls = message.tool_calls ?? [];
  // Claude's own blocks, when they hold every tool call the message names: they keep the thinking blocks.
  if (message.blocks?.length) {
    const ids = new Set((message.blocks as { type?: string; id?: string }[]).filter((b) => b.type === "tool_use").map((b) => b.id));
    if (calls.every((call) => ids.has(call.id))) return message.blocks as Block[];
  }
  const blocks: Block[] = [];
  if (message.content?.trim()) blocks.push({ type: "text", text: message.content });
  for (const call of calls) blocks.push({ type: "tool_use", id: call.id, name: call.function.name, input: parseArguments(call.function.arguments) });
  return blocks;
}

/** The chat format as Claude's `system` and `messages`: tool results go in a user turn, one turn per role in a row. */
export function toClaudeMessages(list: readonly ChatMessage[]): { system: string; messages: Anthropic.Beta.BetaMessageParam[] } {
  const system: string[] = [];
  const messages: { role: "user" | "assistant"; content: Block[] }[] = [];
  const add = (role: "user" | "assistant", blocks: Block[]) => {
    if (!blocks.length) return;
    const last = messages.at(-1);
    if (last?.role === role) last.content.push(...blocks);
    else messages.push({ role, content: [...blocks] });
  };
  for (const message of list) {
    if (message.role === "assistant") add("assistant", assistantBlocks(message));
    else if (message.role === "tool") add("user", [{ type: "tool_result", tool_use_id: message.tool_call_id, content: message.content || "(empty)" }]);
    else if (message.role === "system") system.push(message.content);
    else add("user", message.content.trim() ? [{ type: "text", text: message.content }] : []);
  }
  return { system: system.join("\n\n"), messages };
}

/** The request as Claude Messages API parameters. Exported for the tests. */
export function toClaudeRequest(request: ChatRequest): Anthropic.Beta.MessageCreateParamsNonStreaming {
  const { system, messages } = toClaudeMessages(request.messages);
  const sonnet = request.model === MODELS.sonnet;
  // Claude's structured outputs take a subset of JSON Schema; the SDK's transform moves the rest (maxItems and the
  // like) into descriptions. The callers check those limits in code anyway.
  const schema = { ...request.response_format?.json_schema.schema };
  delete schema.$schema;
  const format = request.response_format ? { format: { type: "json_schema" as const, schema: transformJSONSchema(schema) } } : {};
  return {
    model: request.model,
    max_tokens: request.max_tokens ?? 4096,
    messages,
    ...(system ? { system } : {}),
    thinking: request.thinking ? { type: "adaptive" } : sonnet ? { type: "between_tools" } : { type: "disabled" },
    output_config: { effort: request.effort ?? "medium", ...format },
    ...(request.tools?.length
      ? {
          tools: request.tools.map((tool) => ({
            name: tool.function.name,
            description: tool.function.description,
            input_schema: tool.function.parameters as Anthropic.Beta.BetaTool.InputSchema,
          })),
          tool_choice: { type: request.tool_choice ?? "auto" },
        }
      : {}),
    ...(request.cache ? { cache_control: { type: "ephemeral" as const } } : {}),
    ...(sonnet ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {}),
  };
}

const FINISH: Record<string, string> = { end_turn: "stop", stop_sequence: "stop", tool_use: "tool_calls", max_tokens: "length", refusal: "refusal" };

/** Claude's answer in the chat format. Exported for the tests. */
export function fromClaudeMessage(response: Anthropic.Beta.BetaMessage): ChatResponse {
  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const toolCalls: ToolCall[] = response.content
    .filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use")
    .map((b) => ({ id: b.id, type: "function", function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }));
  const usage = response.usage;
  const input = (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
  const output = usage.output_tokens ?? 0;
  return {
    model: response.model,
    choices: [
      {
        finish_reason: response.stop_reason ? (FINISH[response.stop_reason] ?? response.stop_reason) : null,
        message: { role: "assistant", content: text || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}), blocks: response.content },
      },
    ],
    usage: { prompt_tokens: input, completion_tokens: output, total_tokens: input + output },
  };
}

function timeoutError(ms: number): Error {
  const error = new Error(`No answer within ${Math.round(ms / 100) / 10} s`);
  error.name = "TimeoutError";
  return error;
}

/**
 * One model call. Throws ModelApiError on an HTTP error (after the SDK's own
 * retries of 429, 5xx and dropped connections), and an error named
 * TimeoutError after `timeoutMs`, retries included.
 */
export async function modelChat(request: ChatRequest, options: { timeoutMs?: number } = {}): Promise<ChatResponse> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set. See .env.example.");
  const signal = options.timeoutMs ? AbortSignal.timeout(options.timeoutMs) : undefined;
  try {
    const response = await getAnthropic().beta.messages.create(toClaudeRequest(request), signal ? { signal } : undefined);
    return fromClaudeMessage(response);
  } catch (error) {
    if (signal?.aborted) throw timeoutError(options.timeoutMs!);
    if (error instanceof Anthropic.APIError && typeof error.status === "number") throw new ModelApiError(error.status, error.message);
    throw error;
  }
}
