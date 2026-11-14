/**
 * Has a re-crawled claim really changed (A23)? A pure rule, used by
 * storeProfile() in refresh mode to decide what becomes a "Suggested update".
 *
 * A claim has changed only when its value is different AND it brings at least
 * one quote the old claim did not have. The same quotes put in other words are
 * the same facts. Text is compared after normalizeText(), lists as sets.
 *
 * A new "missing" is never a change: a thinner page must not wipe a profile.
 * A value where the old claim was missing (or there was none) is a change.
 */
import { normalizeText } from "../normalize";
import type { ClaimStatus } from "../schemas";

export type ComparableClaim = {
  value: string | string[] | null;
  status: ClaimStatus;
  /** The quotes of the claim's evidence. */
  quotes: string[];
};

/** The value's items, normalised, without blanks. */
function items(value: ComparableClaim["value"]): Set<string> {
  const list = value === null ? [] : Array.isArray(value) ? value : [value];
  return new Set(list.map(normalizeText).filter(Boolean));
}

const isMissing = (claim: ComparableClaim) => claim.status === "missing" || items(claim.value).size === 0;

function sameItems(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every((item) => b.has(item));
}

export function isChangedClaim(old: ComparableClaim | null, next: ComparableClaim): boolean {
  if (isMissing(next)) return false;
  if (!old || isMissing(old)) return true;
  if (sameItems(items(old.value), items(next.value))) return false;
  const oldQuotes = new Set(old.quotes.map(normalizeText));
  return next.quotes.some((quote) => !oldQuotes.has(normalizeText(quote)));
}
