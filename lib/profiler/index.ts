/**
 * Profiler (A5): stored page text in, draft claims out. It calls the model
 * once and checks the answer against the output schema. Checking the quotes
 * (verify.ts) and storing the claims (store.ts) are separate steps of the
 * profile-company job (A6).
 *
 * The model is MODEL_FOR.profiler (Sonnet 5.5): the profile is what every
 * match starts from, and the Trust report measures its accuracy. The prompt
 * and schema do not depend on the provider.
 *
 * Before the call, pages with text that looks like instructions to an AI are
 * recorded on the run (injection.ts); the quote check then fails quotes taken
 * from that text.
 */
import { MODEL_FOR, modelChat } from "../model";
import type { ProfileField } from "../schemas";
import { profilerInjection, type ProfilerInjection } from "./injection";
import { parseProfilerReply, profilerJsonSchema, toDraftClaims, type DraftClaim } from "./output";
import { buildProfilerUserMessage, PROFILER_SYSTEM_PROMPT, type ProfilerSource } from "./prompt";

export type { ProfilerInjection } from "./injection";
export type { DraftClaim } from "./output";
export type { ProfilerSource } from "./prompt";

/** Netlify cuts a job step off after 30 s; stop before that with a clear error. */
const TIMEOUT_MS = 26_000;

/**
 * Thinking stays off by default: on NVIDIA's model (2026-11-14) one profile
 * with thinking took longer than a job step may; without it, about 8 s.
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
  /**
   * Which pages hold text that looks like instructions to an AI, found before
   * the model was called. The quote check (verify.ts) fails quotes from it.
   */
  injection: ProfilerInjection;
};

export type ProfilerOptions = {
  model?: string;
  thinking?: boolean;
  /** A retry: answer for these fields only, after reading `feedback`. */
  retry?: { fields: ProfileField[]; feedback: string };
};

export async function runProfiler(companyName: string, sources: ProfilerSource[], options: ProfilerOptions = {}): Promise<ProfilerRun> {
  if (!sources.length) throw new Error(`No sources to profile ${companyName} from.`);
  const model = options.model ?? MODEL_FOR.profiler.model;
  const started = Date.now();
  // Labelled only: the prompt is the same either way, and the page text stays data.
  const injection = profilerInjection(sources);
  const fields = options.retry?.fields;
  const question = [buildProfilerUserMessage(companyName, sources), ...(options.retry ? [options.retry.feedback] : [])].join("\n\n");

  const response = await modelChat(
    {
      model,
      max_tokens: 4096,
      messages: [
        { role: "system", content: PROFILER_SYSTEM_PROMPT },
        { role: "user", content: question },
      ],
      response_format: { type: "json_schema", json_schema: { name: "company_profile", schema: profilerJsonSchema(fields), strict: true } },
      effort: MODEL_FOR.profiler.effort,
      thinking: options.thinking ?? DEFAULT_THINKING,
    },
    { timeoutMs: TIMEOUT_MS },
  );

  const choice = response.choices[0];
  const reply = choice?.message.content?.trim() ?? "";
  let output;
  try {
    output = parseProfilerReply(reply, fields);
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
    injection,
  };
}
