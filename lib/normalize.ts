/**
 * Text normaliser (A3). Makes two texts comparable when they differ only in
 * how they are typed: the quote check (A4) runs it on the quote and on the
 * stored page text before looking for one inside the other.
 *
 * It never changes which words are there, so it is for comparing only: show
 * and store the original text.
 */

/** Characters nobody sees: soft hyphen, zero-width space/joiners, word joiner, BOM. */
const INVISIBLE = /[\u00AD\u200B-\u200D\u2060\uFEFF]/g;
/** Every single and double quote mark, straight or curly, plus guillemets, primes and accents used as apostrophes. */
const QUOTE_MARKS = /["'`\u00B4\u2018-\u201F\u2032\u2033\u2039\u203A\u00AB\u00BB]/g;
/** Hyphens and dashes of every length, and the minus sign. */
const DASHES = /[\u2010-\u2015\u2212]/g;

export function normalizeText(text: string): string {
  return text
    .normalize("NFC") // "a" + ring above becomes one "å"
    .replace(INVISIBLE, "")
    .replace(QUOTE_MARKS, "'")
    .replace(DASHES, "-")
    .replace(/\u2026/g, "...")
    .replace(/\s+/g, " ") // spaces, tabs, line breaks and non-breaking spaces
    .trim()
    .toLowerCase();
}
