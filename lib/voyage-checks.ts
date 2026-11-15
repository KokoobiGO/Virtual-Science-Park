/**
 * Live check for Voyage AI (S2), run from /staff/checks with this deploy's
 * VOYAGE_API_KEY. It embeds one short text and passes only on a 1024-dimension vector.
 */
import type { CheckResult } from "./model-checks";
import { VOYAGE_MODEL, VoyageApiError, voyageBaseUrl, voyageEmbed } from "./voyage";

export const VOYAGE_CHECKS = {
  embed: `Embedding (${VOYAGE_MODEL}, 1024 dimensions)`,
} as const;

export type VoyageCheckId = keyof typeof VOYAGE_CHECKS;

export function isVoyageCheckId(value: string | null): value is VoyageCheckId {
  return value !== null && Object.hasOwn(VOYAGE_CHECKS, value);
}

const KEY_HINT =
  "Voyage refused VOYAGE_API_KEY. A key created in MongoDB Atlas needs VOYAGE_BASE_URL=https://ai.mongodb.com/v1; otherwise copy the key again from dashboard.voyageai.com.";

export async function runVoyageCheck(id: VoyageCheckId): Promise<CheckResult & { hint?: string }> {
  const feature = VOYAGE_CHECKS[id];
  if (!process.env.VOYAGE_API_KEY) return { feature, status: "FAIL", detail: "VOYAGE_API_KEY is not set." };
  const base = voyageBaseUrl();
  try {
    const [vector] = await voyageEmbed(["Undervattenssensorer för sjöbevakning"], { inputType: "document" });
    return {
      feature,
      status: "PASS",
      detail: `model ${VOYAGE_MODEL}, ${vector.length} dimensions, host ${new URL(base).host}`,
    };
  } catch (error) {
    const refused = error instanceof VoyageApiError && (error.status === 401 || error.status === 403);
    return { feature, status: "FAIL", detail: `${(error as Error).message} (${base})`, hint: refused ? KEY_HINT : undefined };
  }
}
