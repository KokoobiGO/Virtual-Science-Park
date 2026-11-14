/**
 * Tagger output (A14): one entry per text id, each with the six opportunity
 * tags. The same schema steers the model's decoding (strict JSON schema) and
 * checks its reply.
 *
 * The model answers yes or no for each of the six tags rather than writing a
 * list. On 2026-11-14 we tried both on 20 company profiles: with a list the
 * fast model left most second tags out (EmbeddedArt without marine, Stena Line
 * and SAAB without marine, the electricity utility without energy); with a
 * yes or no per tag it got those right. `about` comes first so the model says
 * what the text is about before it decides.
 */
import { z } from "zod";
import { OpportunityTag } from "../schemas";

const TagAnswers = z.strictObject(
  Object.fromEntries(OpportunityTag.options.map((tag) => [tag, z.boolean()])) as Record<OpportunityTag, z.ZodBoolean>,
);

/** Every id must be there and no other, each with all six tags and no other key. All false is a valid answer. */
function taggerSchema(ids: readonly string[]) {
  return z.strictObject(Object.fromEntries(ids.map((id) => [id, z.strictObject({ about: z.string(), tags: TagAnswers })])));
}

/** The schema as JSON Schema, for the model's `response_format`. */
export function taggerJsonSchema(ids: readonly string[]): Record<string, unknown> {
  return z.toJSONSchema(taggerSchema(ids)) as Record<string, unknown>;
}

export class TaggerOutputError extends Error {
  constructor(
    message: string,
    /** The start of what the model answered, for the run log. */
    readonly reply: string,
  ) {
    super(message);
  }
}

/**
 * Parses the model's reply, with or without a code fence around the JSON, into
 * the tags answered yes, in the order of the tag list. Throws a
 * TaggerOutputError when an id is missing or unknown, a tag is missing or not
 * one of the six, or the reply is not JSON.
 */
export function parseTaggerReply(reply: string, ids: readonly string[]): Map<string, OpportunityTag[]> {
  const fenced = reply.match(/```(?:json)?\s*([\s\S]*?)```/);
  let json: unknown;
  try {
    json = JSON.parse(fenced ? fenced[1] : reply);
  } catch (error) {
    throw new TaggerOutputError(`The tagger's answer is not JSON: ${(error as Error).message}`, reply.slice(0, 500));
  }
  const parsed = taggerSchema(ids).safeParse(json);
  if (!parsed.success) {
    throw new TaggerOutputError(`The tagger's answer does not fit the schema: ${z.prettifyError(parsed.error).slice(0, 300)}`, reply.slice(0, 500));
  }
  const entries = parsed.data as Record<string, { tags: Record<OpportunityTag, boolean> }>;
  return new Map(ids.map((id) => [id, OpportunityTag.options.filter((tag) => entries[id].tags[tag])]));
}
