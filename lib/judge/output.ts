/**
 * The judge's answer (A16): one entry per prompt id, each with a verdict and
 * the texts. The same schema steers the model's decoding (strict JSON schema);
 * verify.ts checks the reply in code, because the schema is a hint, not a
 * guarantee.
 *
 * Lengths are not in the schema: a length cap in the decoder cuts a sentence
 * off in the middle. verify.ts checks them and asks again instead.
 */
import { z } from "zod";

/** The most uncertainties one match may have. */
export const MAX_UNCERTAINTIES = 3;

/**
 * The keys in the order the model writes them. `about` and `link` are the
 * model's notes and are not stored: on 2026-11-14, with the verdict first, the
 * model rejected EmbeddedArt's C5ISR, naval platform and ocean observing calls
 * in one mode and kept them in the other; naming the topic and the closest
 * profile item first makes "reject only when nothing touches it" concrete.
 */
export const JudgeAnswer = z.strictObject({
  about: z.string(),
  link: z.string(),
  verdict: z.enum(["keep", "reject"]),
  rejectionReason: z.string(),
  why: z.string(),
  nextStep: z.string(),
  uncertainties: z.array(z.string()),
});
export type JudgeAnswer = z.infer<typeof JudgeAnswer>;

/** Every id must be there and no other. */
function judgeSchema(ids: readonly string[]) {
  return z.strictObject(Object.fromEntries(ids.map((id) => [id, JudgeAnswer])));
}

/** The schema as JSON Schema, for the model's `response_format`. */
export function judgeJsonSchema(ids: readonly string[]): Record<string, unknown> {
  const schema = z.toJSONSchema(judgeSchema(ids)) as unknown as { properties: Record<string, { properties: { uncertainties: Record<string, unknown> } }> };
  for (const entry of Object.values(schema.properties)) entry.properties.uncertainties.maxItems = MAX_UNCERTAINTIES;
  return schema as unknown as Record<string, unknown>;
}
