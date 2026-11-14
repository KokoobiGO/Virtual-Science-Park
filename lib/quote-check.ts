/**
 * Quote verifier (A4). A claim's quote must be in the stored page text, word
 * for word, in the page's own language. Both are normalised first (A3), so
 * spacing, quote marks, dashes and capitals do not matter; the words do.
 *
 * A made-up, translated or paraphrased quote is not on the page and fails.
 * The profiler then gets one retry, and the claim is dropped if it fails again.
 */
import { normalizeText } from "./normalize";
import { MAX_QUOTE_CHARS } from "./schemas";

/** Shorter than this proves nothing: "AB" or "och" is on every page. */
export const MIN_QUOTE_CHARS = 10;

export type QuoteVerdict = { found: true } | { found: false; reason: "too_short" | "too_long" | "not_in_text" };

const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

/**
 * The normalised quote without the quote marks a model may wrap it in and
 * without closing punctuation: a quote that ends its sentence early with "."
 * where the page goes on with "," still has every word from the page.
 */
function normalizeQuote(quote: string): string {
  return normalizeText(quote)
    .replace(/^['\s]+/, "")
    .replace(/['\s.,;:!?]+$/, "");
}

/** True when `needle` is in `haystack` as whole words, so "art" is not found in "smart". */
function includesWholeWords(haystack: string, needle: string): boolean {
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + 1)) {
    const before = haystack[at - 1];
    const after = haystack[at + needle.length];
    if (!(before && LETTER_OR_DIGIT.test(before)) && !(after && LETTER_OR_DIGIT.test(after))) return true;
  }
  return false;
}

/** Is this quote in the snapshot's text? `snapshotText` is snapshots.content_text as stored. */
export function verifyQuote(quote: string, snapshotText: string): QuoteVerdict {
  if (quote.trim().length > MAX_QUOTE_CHARS) return { found: false, reason: "too_long" };
  const needle = normalizeQuote(quote);
  if (needle.length < MIN_QUOTE_CHARS) return { found: false, reason: "too_short" };
  return includesWholeWords(normalizeText(snapshotText), needle) ? { found: true } : { found: false, reason: "not_in_text" };
}
