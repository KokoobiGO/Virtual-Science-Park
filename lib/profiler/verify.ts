/**
 * Quote check for draft claims (A6). Every quote is looked up in the stored
 * text of its snapshot (A4). A claim keeps the quotes that are there; a stated
 * or inferred claim with no quote left has failed.
 *
 * A quote that is on the page only inside text that looks like instructions
 * to an AI (a flagged passage, injection.ts) fails too, the same way: hidden
 * instructions are not evidence about the company.
 *
 * Failed claims get one retry from the model. What still fails is dropped: it
 * is stored as "missing", never as an unproven claim.
 */
import { verifyQuote } from "../quote-check";
import type { ProfileField } from "../schemas";
import { flaggedPassages, onlyInFlaggedPassages, type FlaggedPassages } from "./injection";
import { missingClaim, type DraftClaim } from "./output";

export type FailedClaim = {
  field: ProfileField;
  /** The quotes that were not found. Quotes from a flagged passage are counted in `flagged`, not repeated here. */
  quotes: string[];
  /** How many of its quotes were only in a flagged passage; absent when none. */
  flagged?: number;
};

export type VerifiedClaims = {
  /** Every claim given, with only the quotes that are in their source. A failed claim has none. */
  claims: DraftClaim[];
  failed: FailedClaim[];
  quotes: { found: number; total: number };
  /** Quotes that were on the page but only in a flagged passage, so they failed. */
  flaggedQuotes: number;
};

export function verifyDraftClaims(drafts: DraftClaim[], textBySnapshotId: Map<string, string>): VerifiedClaims {
  const failed: FailedClaim[] = [];
  const quotes = { found: 0, total: 0 };
  let flaggedQuotes = 0;

  const passagesBySnapshot = new Map<string, FlaggedPassages>();
  const passagesOf = (snapshotId: string) => {
    let passages = passagesBySnapshot.get(snapshotId);
    if (!passages) {
      passages = flaggedPassages(textBySnapshotId.get(snapshotId) ?? "");
      passagesBySnapshot.set(snapshotId, passages);
    }
    return passages;
  };

  const claims = drafts.map((draft) => {
    if (draft.status === "missing") return draft;
    const notFound: string[] = [];
    let flagged = 0;
    const evidence = draft.evidence.filter((e) => {
      if (!verifyQuote(e.quote, textBySnapshotId.get(e.snapshotId) ?? "").found) {
        notFound.push(e.quote);
        return false;
      }
      if (onlyInFlaggedPassages(e.quote, passagesOf(e.snapshotId))) {
        flagged += 1;
        return false;
      }
      return true;
    });
    quotes.total += draft.evidence.length;
    quotes.found += evidence.length;
    flaggedQuotes += flagged;
    if (!evidence.length) failed.push({ field: draft.field, quotes: notFound, ...(flagged ? { flagged } : {}) });
    return { ...draft, evidence };
  });

  return { claims, failed, quotes, flaggedQuotes };
}

/** What the model is told before its one retry. A quote from a flagged passage is not repeated to it. */
export function retryFeedback(failed: FailedClaim[]): string {
  const lines = failed.map(({ field, quotes, flagged }) => {
    const reasons = [
      ...(quotes.length ? [`not in any source word for word: ${quotes.map((q) => JSON.stringify(q)).join(", ")}`] : []),
      ...(flagged ? [`${flagged === 1 ? "a quote" : `${flagged} quotes`} from text that is written to an AI, which says nothing about the company`] : []),
    ];
    return `- ${field}: ${reasons.length ? reasons.join("; ") : "no quote was given"}`;
  });
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
