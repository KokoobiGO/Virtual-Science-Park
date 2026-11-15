/**
 * Tagger (A14): gives each text zero or more of the six opportunity tags
 * (marine, defence, sensor, cyber, ai, energy). One model call per batch of up
 * to ten texts.
 *
 * The model is MODEL_FOR.tagger (Haiku 5.5), thinking off. The prompt and
 * schema do not depend on the provider.
 */
import { MODEL_FOR, modelChat } from "../model";
import type { OpportunityTag } from "../schemas";
import { parseTaggerReply, taggerJsonSchema, TaggerOutputError } from "./output";
import { buildTaggerUserMessage, MAX_TAG_BATCH, TAGGER_SYSTEM_PROMPT, textId } from "./prompt";

export { TaggerOutputError } from "./output";
export { MAX_TAG_BATCH, MAX_TAG_TEXT_CHARS } from "./prompt";

/** Netlify cuts a job step off after 30 s: one batch, retry included, stops before that. */
const TIMEOUT_MS = 26_000;

/** A retry with less time than this left is not worth starting. */
const MIN_RETRY_MS = 4_000;

/** Token counts over all calls, for the job's run log. */
export type TaggerUsage = { calls: number; inputTokens: number; outputTokens: number };

export const emptyTaggerUsage = (): TaggerUsage => ({ calls: 0, inputTokens: 0, outputTokens: 0 });

export type TaggerOptions = {
  model?: string;
  /** Adds each call's token counts to this object. */
  usage?: TaggerUsage;
};

/**
 * Tags for every item, by id. A batch whose answer has a missing, unknown or
 * badly tagged id is asked once more; if that fails too, the whole call throws.
 * API errors (a 429, a timeout) are thrown straight away for the caller to retry.
 */
export async function tagTexts(items: { id: string; text: string }[], options: TaggerOptions = {}): Promise<Map<string, OpportunityTag[]>> {
  const ids = new Set(items.map((item) => item.id));
  if (ids.size !== items.length) throw new Error("tagTexts: every item needs its own id.");

  const result = new Map<string, OpportunityTag[]>();
  for (let start = 0; start < items.length; start += MAX_TAG_BATCH) {
    const batch = items.slice(start, start + MAX_TAG_BATCH);
    const tags = await tagBatch(
      batch.map((item) => item.text),
      options,
    );
    batch.forEach((item, i) => result.set(item.id, tags.get(textId(i))!));
  }
  return result;
}

/** One batch, keyed by the prompt ids T1, T2, ... */
async function tagBatch(texts: string[], options: TaggerOptions): Promise<Map<string, OpportunityTag[]>> {
  const ids = texts.map((_, i) => textId(i));
  const model = options.model ?? MODEL_FOR.tagger.model;
  const deadline = Date.now() + TIMEOUT_MS;

  for (let attempt = 1; ; attempt++) {
    const response = await modelChat(
      {
        model,
        max_tokens: 800,
        messages: [
          { role: "system", content: TAGGER_SYSTEM_PROMPT },
          { role: "user", content: buildTaggerUserMessage(texts) },
        ],
        response_format: { type: "json_schema", json_schema: { name: "tags", schema: taggerJsonSchema(ids), strict: true } },
        // Thinking makes a call several times slower and tagging does not need it.
        effort: MODEL_FOR.tagger.effort,
      },
      { timeoutMs: Math.max(1_000, deadline - Date.now()) },
    );
    if (options.usage) {
      options.usage.calls++;
      options.usage.inputTokens += response.usage?.prompt_tokens ?? 0;
      options.usage.outputTokens += response.usage?.completion_tokens ?? 0;
    }

    const choice = response.choices[0];
    try {
      return parseTaggerReply(choice?.message.content?.trim() ?? "", ids);
    } catch (error) {
      if (!(error instanceof TaggerOutputError) || attempt >= 2 || deadline - Date.now() < MIN_RETRY_MS) {
        if (error instanceof TaggerOutputError) {
          error.message = `${error.message} (finish_reason=${choice?.finish_reason ?? "none"}, attempt ${attempt})`;
        }
        throw error;
      }
    }
  }
}
