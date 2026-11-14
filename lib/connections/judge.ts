/**
 * The connection judge (A28): one model call per candidate pair. The answer
 * comes back in strict JSON; verify.ts then checks it in code, and a pair
 * that fails a check is dropped.
 *
 * While we test with NVIDIA's free key the model is NVIDIA_MODELS.main, with
 * thinking off (thinking on is too slow for a job step) and temperature 0, so
 * a second run on the same data gives the same verdicts as far as the API
 * allows. API errors (a 429, a timeout) are thrown for the caller to retry; an
 * answer that does not fit the schema comes back as `error`.
 */
import { z } from "zod";
import { NVIDIA_MODELS, nvidiaChat } from "../nvidia";
import {
  assignOpportunityIds,
  assignShortIds,
  buildJudgeUserMessage,
  FIT_KINDS,
  JUDGE_SYSTEM_PROMPT,
  judgeClaims,
  type JudgeCompany,
  type SharedOpportunity,
  type ShownClaim,
  type ShownOpportunity,
} from "./prompt";

/** Netlify cuts a job step off after 30 s; one call stops before that. */
export const JUDGE_TIMEOUT_MS = 26_000;

/** The most labels a pair may have. */
export const MAX_LABELS = 4;

/**
 * The keys in the order the model writes them. We tried a free-text "what
 * links them" key before `plausible` on 2026-11-14: the small model then found
 * a link for almost every pair (18 of 60 said yes, two IT consultancies among
 * them, against 6 without it), so the decision comes first. What each side
 * brings comes right after it, before the prose, so the basis is written from
 * two named things.
 */
const JudgeAnswer = z.strictObject({
  plausible: z.boolean(),
  fit: z.enum(FIT_KINDS),
  aBrings: z.string(),
  bBrings: z.string(),
  opportunity: z.string(),
  basis: z.string(),
  firstStep: z.string(),
  sharedOn: z.array(z.string()),
  claimsA: z.array(z.string()),
  claimsB: z.array(z.string()),
});

export type JudgeAnswer = z.infer<typeof JudgeAnswer>;

/**
 * The schema as JSON Schema, for the model's `response_format`. The cited ids
 * are limited to each company's own ids and the shown opportunities, which
 * steers the decoding; verify.ts checks them again, because the schema is a
 * hint, not a guarantee.
 */
export function judgeJsonSchema(shown: readonly ShownClaim[], opportunities: readonly ShownOpportunity[] = []): Record<string, unknown> {
  const schema = z.toJSONSchema(JudgeAnswer) as { properties: Record<string, Record<string, unknown>> };
  schema.properties.sharedOn.maxItems = MAX_LABELS;
  for (const side of ["A", "B"] as const) {
    const ids = shown.filter((c) => c.side === side).map((c) => c.shortId);
    if (ids.length) schema.properties[`claims${side}`].items = { type: "string", enum: ids };
  }
  schema.properties.opportunity = { type: "string", enum: ["", ...opportunities.map((o) => o.shortId)] };
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
  /** The shared opportunities as the model saw them (O1, O2, ...). */
  opportunities: ShownOpportunity[];
  model: string;
  seconds: number;
  usage: { inputTokens: number; outputTokens: number };
};

export type JudgeOptions = { model?: string; timeoutMs?: number; opportunities?: readonly SharedOpportunity[] };

/** One judgement. Only the six judge fields of each company are shown, and at most three shared opportunities. */
export async function judgePair(a: JudgeCompany, b: JudgeCompany, options: JudgeOptions = {}): Promise<JudgeRun> {
  const shown = assignShortIds(judgeClaims(a.claims), judgeClaims(b.claims));
  const opportunities = assignOpportunityIds(options.opportunities ?? []);
  const model = options.model ?? NVIDIA_MODELS.main;
  const started = Date.now();

  const response = await nvidiaChat(
    {
      model,
      max_tokens: 900,
      temperature: 0,
      messages: [
        { role: "system", content: JUDGE_SYSTEM_PROMPT },
        { role: "user", content: buildJudgeUserMessage(a, b, shown, opportunities) },
      ],
      response_format: { type: "json_schema", json_schema: { name: "connection", schema: judgeJsonSchema(shown, opportunities), strict: true } },
      chat_template_kwargs: { enable_thinking: false },
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
    opportunities,
    model: response.model ?? model,
    seconds: Math.round((Date.now() - started) / 100) / 10,
    usage: { inputTokens: response.usage?.prompt_tokens ?? 0, outputTokens: response.usage?.completion_tokens ?? 0 },
  };
}
