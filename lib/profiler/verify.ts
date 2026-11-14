/**
 * Quote check for draft claims (A6). Every quote is looked up in the stored
 * text of its snapshot (A4). A claim keeps the quotes that are there; a stated
 * or inferred claim with no quote left has failed.
 *
 * Failed claims get one retry from the model. What still fails is dropped: it
 * is stored as "missing", never as an unproven claim.
 */
import { verifyQuote } from "../quote-check";
import type { ProfileField } from "../schemas";
import { missingClaim, type DraftClaim } from "./output";

export type FailedClaim = { field: ProfileField; quotes: string[] };

export type VerifiedClaims = {
  /** Every claim given, with only the quotes that are in their source. A failed claim has none. */
  claims: DraftClaim[];
  failed: FailedClaim[];
  quotes: { found: number; total: number };
};

export function verifyDraftClaims(drafts: DraftClaim[], textBySnapshotId: Map<string, string>): VerifiedClaims {
  const failed: FailedClaim[] = [];
  const quotes = { found: 0, total: 0 };

  const claims = drafts.map((draft) => {
    if (draft.status === "missing") return draft;
    const evidence = draft.evidence.filter((e) => verifyQuote(e.quote, textBySnapshotId.get(e.snapshotId) ?? "").found);
    quotes.total += draft.evidence.length;
    quotes.found += evidence.length;
    if (!evidence.length) failed.push({ field: draft.field, quotes: draft.evidence.map((e) => e.quote) });
    return { ...draft, evidence };
  });

  return { claims, failed, quotes };
}

/** What the model is told before its one retry. */
export function retryFeedback(failed: FailedClaim[]): string {
  const lines = failed.map(({ field, quotes }) =>
    quotes.length
      ? `- ${field}: not in any source word for word: ${quotes.map((q) => JSON.stringify(q)).join(", ")}`
      : `- ${field}: no quote was given`,
  );
  return [
    "Your first answer had quotes that are not exactly in their source, so these fields were thrown away:",
    ...lines,
    "Answer again for these fields only. Find the sentence in the source and copy it character for character, in the source's own language. If the sources do not say it, answer \"missing\".",
  ].join("\n");
}

/**
 * The final claims: the first answer, with each failed field replaced by its
 * retry when the retry passed the quote check, and by "missing" when not.
 */
export function mergeRetry(first: VerifiedClaims, retry: VerifiedClaims | null): { claims: DraftClaim[]; dropped: ProfileField[] } {
  const stillFailed = new Set(retry ? retry.failed.map((f) => f.field) : first.failed.map((f) => f.field));
  const retried = new Map((retry?.claims ?? []).map((claim) => [claim.field, claim]));
  const dropped: ProfileField[] = [];

  const claims = first.claims.map((claim) => {
    if (!first.failed.some((f) => f.field === claim.field)) return claim;
    const second = retried.get(claim.field);
    if (second && second.status !== "missing" && !stillFailed.has(claim.field)) return second;
    dropped.push(claim.field);
    return missingClaim(claim.field);
  });
  return { claims, dropped };
}
