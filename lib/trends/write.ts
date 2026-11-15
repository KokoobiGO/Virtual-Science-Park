/**
 * The trend analyst (A27): one model call writes one area's note from its
 * inputs; the checks in verify.ts decide whether it may be stored. A note that
 * fails is asked for once more with the reasons; a second failure means no
 * note for that area this week.
 *
 * The model is MODEL_FOR.trends (Sonnet 5.5): members read the note. Thinking
 * is off. The prompt and schema do not depend on the provider.
 */
import { z } from "zod";
import { MODEL_FOR, modelChat, type ChatMessage } from "../model";
import type { OpportunityTag } from "../schemas";
import type { TrendCandidate } from "./inputs";
import { buildTrendUserMessage, inputId, inputText, TREND_SYSTEM_PROMPT } from "./prompt";
import { checkNote, MIN_SOURCES, retryFeedback, type CheckedInput, type TrendDraft } from "./verify";

/** Netlify cuts a job step off after 30 s: both attempts together stop before that. */
const TIMEOUT_MS = 26_000;

/** A retry with less time than this left is not worth starting. */
const MIN_RETRY_MS = 6_000;

/**
 * Sources come first: the model picks what the note is about before it
 * writes, and may pick at most MAX_CITED. Tried on 2026-11-14: with the
 * sources last, the notes walked through six or seven inputs and put dates
 * on the wrong calls.
 */
const TrendReply = z.object({ sources: z.array(z.string()), title: z.string(), body: z.string() });

/** Inputs one note may rest on: enough for a thread, few enough to keep it a note. */
export const MAX_CITED = 4;

/** The reply schema for the model's decoding: the sources can only be the ids it was shown. */
export function trendJsonSchema(ids: readonly string[]): Record<string, unknown> {
  const schema = z.toJSONSchema(TrendReply) as unknown as { properties: { sources: Record<string, unknown> } };
  schema.properties.sources = { type: "array", items: { type: "string", enum: [...ids] }, minItems: MIN_SOURCES, maxItems: Math.min(MAX_CITED, ids.length) };
  return schema as unknown as Record<string, unknown>;
}

export class TrendOutputError extends Error {}

/** Parses the model's reply, with or without a code fence around the JSON. */
export function parseTrendReply(reply: string): TrendDraft {
  const fenced = reply.match(/```(?:json)?\s*([\s\S]*?)```/);
  let json: unknown;
  try {
    json = JSON.parse(fenced ? fenced[1] : reply);
  } catch (error) {
    throw new TrendOutputError(`The answer is not JSON: ${(error as Error).message}`);
  }
  const parsed = TrendReply.safeParse(json);
  if (!parsed.success) throw new TrendOutputError(`The answer does not fit the schema: ${z.prettifyError(parsed.error).slice(0, 300)}`);
  return { title: tidy(parsed.data.title), body: tidy(parsed.data.body), sources: parsed.data.sources.map((s) => s.trim().toUpperCase()) };
}

/**
 * Whitespace collapsed, and id lists in brackets dropped: "(S2, S3)" means
 * nothing to the reader, and the model adds them often enough that rejecting
 * them cost a note. Ids left in running text still fail the checks.
 */
function tidy(text: string): string {
  return text
    .replace(/\s*\(\s*S\d{1,2}(?:\s*(?:,|and|&)\s*S\d{1,2})*\s*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Token counts over all calls, for the job's run log. */
export type TrendUsage = { calls: number; inputTokens: number; outputTokens: number };

export const emptyTrendUsage = (): TrendUsage => ({ calls: 0, inputTokens: 0, outputTokens: 0 });

export type WrittenNote =
  | { ok: true; draft: TrendDraft; attempts: number; seconds: number }
  /** `problems` and `rejected` are the last attempt's: the second, or the first when there was no time to retry. */
  | { ok: false; problems: string[]; rejected: TrendDraft | null; attempts: number; seconds: number };

export type WriteOptions = {
  model?: string;
  /** Adds each call's token counts to this object. */
  usage?: TrendUsage;
};

/** The inputs as the checks see them: the same ids and text the model was shown. */
export const checkedInputs = (inputs: TrendCandidate[], weekOf: string): CheckedInput[] =>
  inputs.map((input, i) => ({ id: inputId(i), text: inputText(input, weekOf) }));

/**
 * Writes one area's note and checks it, with one retry. API errors (a 429, a
 * timeout) are thrown for the caller to retry; a note that fails its checks
 * twice comes back as `ok: false` with the reasons.
 */
export async function writeNote(area: OpportunityTag, inputs: TrendCandidate[], weekOf: string, options: WriteOptions = {}): Promise<WrittenNote> {
  const model = options.model ?? MODEL_FOR.trends.model;
  const started = Date.now();
  const deadline = started + TIMEOUT_MS;
  const checked = checkedInputs(inputs, weekOf);
  const question = buildTrendUserMessage(area, inputs, weekOf);
  let messages: ChatMessage[] = [
    { role: "system", content: TREND_SYSTEM_PROMPT },
    { role: "user", content: question },
  ];
  const seconds = () => Math.round((Date.now() - started) / 100) / 10;

  for (let attempt = 1; ; attempt++) {
    const response = await modelChat(
      {
        model,
        max_tokens: 800,
        messages,
        response_format: { type: "json_schema", json_schema: { name: "trend_note", schema: trendJsonSchema(checked.map((c) => c.id)), strict: true } },
        // Thinking stays off: on NVIDIA's model (2026-11-14) one note took 72 s and 6,000 reasoning tokens without an answer.
        effort: MODEL_FOR.trends.effort,
      },
      { timeoutMs: Math.max(1_000, deadline - Date.now()) },
    );
    if (options.usage) {
      options.usage.calls++;
      options.usage.inputTokens += response.usage?.prompt_tokens ?? 0;
      options.usage.outputTokens += response.usage?.completion_tokens ?? 0;
    }

    const reply = response.choices[0]?.message.content?.trim() ?? "";
    let problems: string[];
    let draft: TrendDraft | null = null;
    try {
      draft = parseTrendReply(reply);
      problems = checkNote(draft, checked);
    } catch (error) {
      if (!(error instanceof TrendOutputError)) throw error;
      problems = [`${error.message} (finish_reason=${response.choices[0]?.finish_reason ?? "none"})`];
    }
    if (draft && !problems.length) return { ok: true, draft, attempts: attempt, seconds: seconds() };
    if (attempt >= 2) return { ok: false, problems, rejected: draft, attempts: attempt, seconds: seconds() };
    if (deadline - Date.now() < MIN_RETRY_MS) {
      return { ok: false, problems: [...problems, "No time left in this step to ask again."], rejected: draft, attempts: attempt, seconds: seconds() };
    }

    // The same question with the reasons added, not a reply to the first answer: shown its own answer, the
    // model repeated the mistake in 4 of 6 retries on 2026-11-14.
    messages = [
      { role: "system", content: TREND_SYSTEM_PROMPT },
      { role: "user", content: `${question}\n\n${retryFeedback(problems)}` },
    ];
  }
}
