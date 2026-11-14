/**
 * Profiler output schema (A5): what the model must answer, and how that
 * becomes draft claims in the shape of lib/schemas.ts.
 *
 * The model-facing schema is kept plain (no nullable values, no number
 * ranges) because the JSON schema also steers the model's decoding. The rules
 * the model may break are enforced here in code instead.
 */
import { z } from "zod";
import { ProfileField, type ClaimStatus, type QuoteLang } from "../schemas";
import { sourceId, type ProfilerSource } from "./prompt";

/** More quotes per field make the answer slow without making it truer. */
export const MAX_QUOTES_PER_FIELD = 3;

const ProfilerEvidence = z.object({
  /** The id of the source the quote is copied from, e.g. "S1". */
  source: z.string(),
  quote: z.string(),
});

/**
 * The order matters: the model writes the keys in this order, and it copies a
 * quote more faithfully before it has put the same thing in English.
 */
const ProfilerClaim = z.object({
  status: z.enum(["stated", "inferred", "missing"]),
  evidence: z.array(ProfilerEvidence),
  values: z.array(z.string()),
  confidence: z.number(),
});

const ALL_FIELDS: readonly ProfileField[] = ProfileField.options;

/** One claim per profile field. A retry asks for some of the fields only. */
function profilerSchema(fields: readonly ProfileField[]) {
  return z.object(Object.fromEntries(fields.map((field) => [field, ProfilerClaim])) as Record<string, typeof ProfilerClaim>);
}

export type ProfilerOutput = Partial<Record<ProfileField, z.infer<typeof ProfilerClaim>>>;

/**
 * The same schema as JSON Schema, for the model's `response_format`. It also
 * caps the quotes per field; the parser does not insist on the cap, so one
 * quote too many costs us that quote and not the whole answer.
 */
export function profilerJsonSchema(fields: readonly ProfileField[] = ALL_FIELDS): Record<string, unknown> {
  const schema = z.toJSONSchema(profilerSchema(fields)) as unknown as {
    properties: Record<string, { properties: { evidence: Record<string, unknown> } }>;
  };
  for (const claim of Object.values(schema.properties)) claim.properties.evidence.maxItems = MAX_QUOTES_PER_FIELD;
  return schema;
}

/** Parses the model's reply, with or without a code fence around the JSON. */
export function parseProfilerReply(reply: string, fields: readonly ProfileField[] = ALL_FIELDS): ProfilerOutput {
  const fenced = reply.match(/```(?:json)?\s*([\s\S]*?)```/);
  return profilerSchema(fields).parse(JSON.parse(fenced ? fenced[1] : reply)) as ProfilerOutput;
}

/** A claim as the profiler proposed it. Its quotes are not checked yet (see verify.ts). */
export type DraftClaim = {
  field: ProfileField;
  /** One sentence for summary, a list for the other fields, null when missing. */
  value: string | string[] | null;
  status: Extract<ClaimStatus, "stated" | "inferred" | "missing">;
  confidence: number;
  evidence: { snapshotId: string; url: string; quote: string; quoteLang: QuoteLang }[];
};

export const missingClaim = (field: ProfileField): DraftClaim => ({ field, value: null, status: "missing", confidence: 0, evidence: [] });

/** Model output to draft claims, in profile order, with the rules applied. Fields the output lacks are left out. */
export function toDraftClaims(output: ProfilerOutput, sources: ProfilerSource[]): DraftClaim[] {
  const byId = new Map(sources.map((source, i) => [sourceId(i), source]));

  return ALL_FIELDS.flatMap((field): DraftClaim[] => {
    const claim = output[field];
    if (!claim) return [];
    const values = [...new Set(claim.values.map((v) => v.replace(/\s+/g, " ").trim()).filter(Boolean))];
    if (claim.status === "missing" || values.length === 0) return [missingClaim(field)];

    const evidence = claim.evidence.flatMap((e) => {
      const source = byId.get(e.source.trim().toUpperCase());
      const quote = e.quote.trim();
      // A quote from a source that was never shown cannot be checked: leave it out.
      return source && quote ? [{ snapshotId: source.snapshotId, url: source.url, quote, quoteLang: source.lang ?? ("other" as const) }] : [];
    });

    return [
      {
        field,
        value: field === "summary" ? values[0] : values,
        // Interests are our reading of the sources, whatever the model called them.
        status: field === "inferredInterests" ? "inferred" : claim.status,
        confidence: Math.min(1, Math.max(0, Number.isFinite(claim.confidence) ? claim.confidence : 0)),
        evidence: evidence.slice(0, MAX_QUOTES_PER_FIELD),
      },
    ];
  });
}
