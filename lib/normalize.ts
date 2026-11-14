/**
 * Text normaliser (A3). Makes two texts comparable when they differ only in
 * how they are typed: the quote check (A4) runs it on the quote and on the
 * stored page text before looking for one inside the other.
 *
 * It never changes which words are there, so it is for comparing only: show
 * and store the original text.
 */

/** Characters nobody sees: soft hyphen, zero-width space/joiners, word joiner, BOM. */
const INVISIBLE = /[­​-‍⁠﻿]/g;
/** Every single and double quote mark, straight or curly, plus guillemets, primes and accents used as apostrophes. */
const QUOTE_MARKS = /["'`´‘-‟′″‹›«»]/g;
/** Hyphens and dashes of every length, and the minus sign. */
const DASHES = /[‐-―−]/g;

export function normalizeText(text: string): string {
  return text
    .normalize("NFC") // "a" + ring above becomes one "å"
    .replace(INVISIBLE, "")
    .replace(QUOTE_MARKS, "'")
    .replace(DASHES, "-")
    .replace(/…/g, "...")
    .replace(/\s+/g, " ") // spaces, tabs, line breaks and non-breaking spaces
    .trim()
    .toLowerCase();
}
