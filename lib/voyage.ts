/**
 * Voyage AI embeddings (S2), called with plain fetch (no SDK to pin). Checked
 * against docs.voyageai.com on 2026-11-14: voyage-4 takes output_dimension
 * 256, 512, 1024 (default) or 2048; we ask for 1024 to match the pgvector
 * columns. Keys created in MongoDB Atlas need VOYAGE_BASE_URL=https://ai.mongodb.com/v1.
 */
import { EMBEDDING_DIMENSIONS } from "./db/schema";

/** VOYAGE_MODEL overrides it, e.g. voyage-4-lite (also 1024 dimensions). */
export const VOYAGE_MODEL = process.env.VOYAGE_MODEL || "voyage-4";

export const VOYAGE_DEFAULT_BASE_URL = "https://api.voyageai.com/v1";

export function voyageBaseUrl(): string {
  return (process.env.VOYAGE_BASE_URL || VOYAGE_DEFAULT_BASE_URL).replace(/\/+$/, "");
}

export class VoyageApiError extends Error {
  constructor(
    readonly status: number,
    body: string,
  ) {
    super(`Voyage API ${status}: ${body.slice(0, 300)}`);
  }
}

/**
 * One 1024-dimension vector per text, in order. Use inputType "query" for a
 * search and "document" for text we store. Throws VoyageApiError on a non-2xx answer.
 */
export async function voyageEmbed(
  texts: string[],
  { inputType }: { inputType?: "query" | "document" } = {},
): Promise<number[][]> {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) throw new Error("VOYAGE_API_KEY is not set. See .env.example.");
  const res = await fetch(`${voyageBaseUrl()}/embeddings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: VOYAGE_MODEL, input: texts, input_type: inputType, output_dimension: EMBEDDING_DIMENSIONS }),
  });
  if (!res.ok) throw new VoyageApiError(res.status, await res.text());

  const body = (await res.json()) as { data: { embedding: number[]; index: number }[] };
  const vectors = body.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
  if (vectors.length !== texts.length || vectors.some((v) => v.length !== EMBEDDING_DIMENSIONS)) {
    throw new Error(
      `Voyage returned ${vectors.length} vectors of ${vectors[0]?.length} dimensions; expected ${texts.length} of ${EMBEDDING_DIMENSIONS}.`,
    );
  }
  return vectors;
}
