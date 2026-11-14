/**
 * Profiler (A5): stored page text in, draft claims out. It calls the model
 * once and checks the answer against the output schema. It does not check
 * quotes or store anything: that is the pipeline's job (A6).
 *
 * While we test with NVIDIA's free key the model is NVIDIA_MODELS.main; the
 * prompt and schema do not depend on the provider.
 */
import { NVIDIA_MODELS, nvidiaChat } from "../nvidia";
import { parseProfilerReply, profilerJsonSchema, toDraftClaims, type DraftClaim } from "./output";
import { buildProfilerUserMessage, PROFILER_SYSTEM_PROMPT, type ProfilerSource } from "./prompt";

export type { DraftClaim } from "./output";
export type { ProfilerSource } from "./prompt";

/** Netlify cuts a job step off after 30 s; stop before that with a clear error. */
const TIMEOUT_MS = 26_000;

/**
 * Measured on nemotron-3.5-lightning on 2026-11-14: with the model's thinking
 * on, one profile takes longer than a job step may; with it off, about 8 s.
 */
const DEFAULT_THINKING = false;

export class ProfilerOutputError extends Error {
  constructor(
    message: string,
    /** The start of what the model answered, for the run log. */
    readonly reply: string,
  ) {
    super(message);
  }
}

export type ProfilerRun = {
  claims: DraftClaim[];
  model: string;
  seconds: number;
  finishReason: string | null;
  usage: { promptTokens: number; completionTokens: number } | null;
};

export async function runProfiler(
  companyName: string,
  sources: ProfilerSource[],
  options: { model?: string; thinking?: boolean } = {},
): Promise<ProfilerRun> {
  if (!sources.length) throw new Error(`No sources to profile ${companyName} from.`);
  const model = options.model ?? NVIDIA_MODELS.main;
  const started = Date.now();

  const response = await nvidiaChat(
    {
      model,
      max_tokens: 4096,
      temperature: 0.2,
      messages: [
        { role: "system", content: PROFILER_SYSTEM_PROMPT },
        { role: "user", content: buildProfilerUserMessage(companyName, sources) },
      ],
      response_format: { type: "json_schema", json_schema: { name: "company_profile", schema: profilerJsonSchema(), strict: true } },
      chat_template_kwargs: { enable_thinking: options.thinking ?? DEFAULT_THINKING },
    },
    { timeoutMs: TIMEOUT_MS },
  );

  const choice = response.choices[0];
  const reply = choice?.message.content?.trim() ?? "";
  let output;
  try {
    output = parseProfilerReply(reply);
  } catch (error) {
    throw new ProfilerOutputError(
      `The profiler's answer does not fit the output schema (finish_reason=${choice?.finish_reason ?? "none"}): ${(error as Error).message.slice(0, 300)}`,
      reply.slice(0, 500),
    );
  }

  return {
    claims: toDraftClaims(output, sources),
    model: response.model ?? model,
    seconds: Math.round((Date.now() - started) / 100) / 10,
    finishReason: choice?.finish_reason ?? null,
    usage: response.usage ? { promptTokens: response.usage.prompt_tokens, completionTokens: response.usage.completion_tokens } : null,
  };
}
