/**
 * Shared NVIDIA API settings (S2, S3). While we test with NVIDIA's free
 * developer key instead of Claude, model IDs and the endpoint live here, so a
 * switch is one edit.
 *
 * The API is OpenAI-compatible chat completions, called with plain fetch (no
 * SDK to pin). Model IDs were checked against the live model list on
 * 2026-11-14; see "NVIDIA API (S3)" in the README. Run `npm run check:nvidia`
 * to test each feature.
 */

/**
 * NVIDIA_MODEL_FAST / NVIDIA_MODEL_MAIN override these, so a key that cannot
 * call one model can be tested on another without a code change.
 */
export const NVIDIA_MODELS = {
  /**
   * Both slots use nemotron-3.5-super-vl-120b-a12b since 2026-11-14. In the
   * benchmark on our free key (docs/model-choice.md) it got 15 of 15 judge
   * verdicts right against 14 for nemotron-3.5-lightning-30b-a3b, 14 of 15
   * judge entries through the code checks on the first answer against 11, and
   * 10 of 10 texts tagged right against 7, at the same speed (about 6 s a
   * call). Most other models in the list do not answer for a free key.
   */
  /** Scope classifier, tagging. */
  fast: process.env.NVIDIA_MODEL_FAST || "nvidia/nemotron-3.5-super-vl-120b-a12b",
  /** Profiler, matcher judge, trend notes, connections, Scout, Copilot. */
  main: process.env.NVIDIA_MODEL_MAIN || "nvidia/nemotron-3.5-super-vl-120b-a12b",
};

export const NVIDIA_DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1";

export function nvidiaBaseUrl(): string {
  return (process.env.NVIDIA_API_BASE_URL || NVIDIA_DEFAULT_BASE_URL).replace(/\/+$/, "");
}

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

export type ToolDefinition = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export type ChatRequest = {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  tools?: ToolDefinition[];
  tool_choice?: "auto" | "none" | "required";
  response_format?: { type: "json_schema"; json_schema: { name: string; schema: Record<string, unknown>; strict?: boolean } };
  /** NIM's own structured-output field, for endpoints without `response_format`. */
  nvext?: { guided_json?: Record<string, unknown> };
  /** Passed to the model's chat template, e.g. `{ enable_thinking: false }` on Nemotron. */
  chat_template_kwargs?: Record<string, unknown>;
};

export type ChatResponse = {
  model: string;
  choices: {
    finish_reason: string | null;
    message: { role: "assistant"; content: string | null; reasoning_content?: string | null; tool_calls?: ToolCall[] };
  }[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
};

export class NvidiaApiError extends Error {
  constructor(
    readonly status: number,
    body: string,
  ) {
    super(`NVIDIA API ${status}: ${body.slice(0, 300)}`);
  }
}

/** One chat completion. Throws NvidiaApiError on a non-2xx answer, and a TimeoutError after `timeoutMs`. */
export async function nvidiaChat(request: ChatRequest, options: { timeoutMs?: number } = {}): Promise<ChatResponse> {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) throw new Error("NVIDIA_API_KEY is not set. See .env.example.");
  const res = await fetch(`${nvidiaBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(request),
    signal: options.timeoutMs ? AbortSignal.timeout(options.timeoutMs) : undefined,
  });
  if (!res.ok) throw new NvidiaApiError(res.status, await res.text());
  return (await res.json()) as ChatResponse;
}

/** Model IDs the endpoint serves right now. */
export async function listNvidiaModels(): Promise<string[]> {
  const res = await fetch(`${nvidiaBaseUrl()}/models`, {
    headers: process.env.NVIDIA_API_KEY ? { Authorization: `Bearer ${process.env.NVIDIA_API_KEY}` } : {},
  });
  if (!res.ok) throw new NvidiaApiError(res.status, await res.text());
  const body = (await res.json()) as { data: { id: string }[] };
  return body.data.map((m) => m.id);
}
