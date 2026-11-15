/**
 * The connection judge (A28): one model call per candidate pair. The answer
 * comes back in strict JSON; verify.ts then checks it in code, and a pair
 * that fails a check is dropped.
 *
 * The model is MODEL_FOR.connections (Sonnet 5.5), with thinking off (thinking
 * on is too slow for a job step). API errors (a 429, a
 * timeout) are thrown for the caller to retry; an answer that does not fit the
 * schema comes back as `error`.
 */
import { z } from "zod";
import { MODEL_FOR, modelChat } from "../model";
import { assignShortIds, buildJudgeUserMessage, JUDGE_SYSTEM_PROMPT, judgeClaims, type JudgeCompany, type ShownClaim } from "./prompt";

/** Netlify cuts a job step off after 30 s; one call stops before that. */
export const JUDGE_TIMEOUT_MS = 26_000;

/** The most labels a pair may have. */
export const MAX_LABELS = 4;

/**
 * The keys in the order the model writes them. We tried a free-text "what
 * links them" key before `plausible` on 2026-11-14: the model then found a
 * link for almost every pair (18 of 60 said yes, two IT consultancies among
 * them, against 6 without it), so the decision comes first.
 */
const JudgeAnswer = z.strictObject({
  plausible: z.boolean(),
  basis: z.string(),
  sharedOn: z.array(z.string()),
  claimsA: z.array(z.string()),
  claimsB: z.array(z.string()),
});

export type JudgeAnswer = z.infer<typeof JudgeAnswer>;

/**
 * The schema as JSON Schema, for the model's `response_format`. The cited ids
 * are limited to each company's own ids, which steers the decoding; verify.ts
 * checks them again, because the schema is a hint, not a guarantee.
 */
export function judgeJsonSchema(shown: readonly ShownClaim[]): Record<string, unknown> {
  const schema = z.toJSONSchema(JudgeAnswer) as { properties: Record<string, Record<string, unknown>> };
  schema.properties.sharedOn.maxItems = MAX_LABELS;
  for (const side of ["A", "B"] as const) {
    const ids = shown.filter((c) => c.side === side).map((c) => c.shortId);
    if (ids.length) schema.properties[`claims${side}`].items = { type: "string", enum: ids };
  }
  return schema;
}

/** Parses the model's reply, with or without a code fence around the JSON. Throws when it does not fit. */
export function parseJudgeReply(reply: string): JudgeAnswer {
  const fenced = reply.match(/```(?:json)?\s*([\s\S]*?)```/);
  return JudgeAnswer.parse(JSON.parse(fenced ? fenced[1] : reply));
}

export type JudgeRun = {
  /** Null when the reply did not fit the schema; `error` says why. */
  answer: JudgeAnswer | null;
  error: string | null;
  /** The claims as the model saw them, with their short ids. */
  shown: ShownClaim[];
  model: string;
  seconds: number;
  usage: { inputTokens: number; outputTokens: number };
};

export type JudgeOptions = { model?: string; timeoutMs?: number };

/** One judgement. Only the six judge fields of each company are shown. */
export async function judgePair(a: JudgeCompany, b: JudgeCompany, options: JudgeOptions = {}): Promise<JudgeRun> {
  const shown = assignShortIds(judgeClaims(a.claims), judgeClaims(b.claims));
  const model = options.model ?? MODEL_FOR.connections.model;
  const started = Date.now();

  const response = await modelChat(
    {
      model,
      max_tokens: 700,
      messages: [
        { role: "system", content: JUDGE_SYSTEM_PROMPT },
        { role: "user", content: buildJudgeUserMessage(a, b, shown) },
      ],
      response_format: { type: "json_schema", json_schema: { name: "connection", schema: judgeJsonSchema(shown), strict: true } },
      effort: MODEL_FOR.connections.effort,
    },
    { timeoutMs: options.timeoutMs ?? JUDGE_TIMEOUT_MS },
  );

  const choice = response.choices[0];
  const reply = choice?.message.content?.trim() ?? "";
  let answer: JudgeAnswer | null = null;
  let error: string | null = null;
  try {
    answer = parseJudgeReply(reply);
  } catch (e) {
    error = `The answer does not fit the schema (finish_reason=${choice?.finish_reason ?? "none"}): ${(e as Error).message.slice(0, 200)}`;
  }

  return {
    answer,
    error,
    shown,
    model: response.model ?? model,
    seconds: Math.round((Date.now() - started) / 100) / 10,
    usage: { inputTokens: response.usage?.prompt_tokens ?? 0, outputTokens: response.usage?.completion_tokens ?? 0 },
  };
}
