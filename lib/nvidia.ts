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
  /** Scope classifier, tagging: cheap and fast. */
  fast: process.env.NVIDIA_MODEL_FAST || "nvidia/nemotron-3.5-lightning-30b-a3b",
  /**
   * Profiler, matcher judge, digest, Scout, Copilot. nemotron-3-super-120b-a12b
   * is in the model list but answered 404 "Function not found for account" for
   * our free key on 2026-11-14, so main uses the fast model until a bigger
   * model is confirmed for the account.
   */
  main: process.env.NVIDIA_MODEL_MAIN || "nvidia/nemotron-3.5-lightning-30b-a3b",
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

/** One chat completion. Throws NvidiaApiError on a non-2xx answer. */
export async function nvidiaChat(request: ChatRequest): Promise<ChatResponse> {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) throw new Error("NVIDIA_API_KEY is not set. See .env.example.");
  const res = await fetch(`${nvidiaBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(request),
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
