/**
 * The evidence viewer (C6): a quote with a little of the page text around it,
 * so the reader sees where on the page it stands. The quote is found the way
 * the quote check (lib/quote-check.ts) finds it: in the normalised text, as
 * whole words. What is shown is the stored page text itself, in its own
 * language, never a normalised or translated copy.
 */
import { normalizeText } from "../normalize";

/** Characters of page text shown on each side of the quote, before cutting at a word. */
export const CONTEXT_CHARS = 180;

export type QuoteInContext = {
  /** Page text before the quote. Starts with a cut word removed when `cutBefore`. */
  before: string;
  /** The quote as it stands on the page. */
  match: string;
  after: string;
  cutBefore: boolean;
  cutAfter: boolean;
};

const INVISIBLE = /[­​-‍⁠﻿]/;
const QUOTE_MARK = /["'`´‘-‟′″‹›«»]/;
const DASH = /[‐-―−]/;
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

/**
 * normalizeText(), plus where each character of the result came from:
 * `from[k]` and `to[k]` are the span of `text` that produced character k.
 */
function normalizeWithMap(text: string): { norm: string; from: number[]; to: number[] } {
  let norm = "";
  const from: number[] = [];
  const to: number[] = [];
  let at = 0;
  for (const ch of text) {
    const start = at;
    at += ch.length;
    let out: string;
    if (INVISIBLE.test(ch)) continue;
    if (QUOTE_MARK.test(ch)) out = "'";
    else if (DASH.test(ch)) out = "-";
    else if (ch === "…") out = "...";
    else if (/\s/.test(ch)) {
      if (!norm || norm.endsWith(" ")) continue;
      out = " ";
    } else out = ch.toLowerCase();
    for (let k = 0; k < out.length; k++) {
      from.push(start);
      to.push(at);
    }
    norm += out;
  }
  return { norm, from, to };
}

/** As in the quote check: no wrapping quote marks, no closing punctuation. */
function quoteNeedle(quote: string): string {
  return normalizeText(quote)
    .replace(/^['\s]+/, "")
    .replace(/['\s.,;:!?]+$/, "");
}

const collapse = (text: string) => text.replace(/\s+/g, " ");

/** The quote inside the page text with some text around it, or null when the quote is not in the text. */
export function quoteInContext(pageText: string, quote: string, contextChars = CONTEXT_CHARS): QuoteInContext | null {
  const text = pageText.normalize("NFC");
  const needle = quoteNeedle(quote);
  if (!needle) return null;
  const { norm, from, to } = normalizeWithMap(text);

  for (let at = norm.indexOf(needle); at !== -1; at = norm.indexOf(needle, at + 1)) {
    const beforeChar = norm[at - 1];
    const afterChar = norm[at + needle.length];
    if ((beforeChar && LETTER_OR_DIGIT.test(beforeChar)) || (afterChar && LETTER_OR_DIGIT.test(afterChar))) continue;

    const start = from[at];
    const end = to[at + needle.length - 1];
    const cutBefore = start > contextChars;
    const cutAfter = text.length - end > contextChars;
    let before = text.slice(Math.max(0, start - contextChars), start);
    let after = text.slice(end, end + contextChars);
    // Do not show half a word at either end.
    if (cutBefore) before = before.replace(/^\S*\s+/, "");
    if (cutAfter) after = after.replace(/\s+\S*$/, "");
    return { before: collapse(before).trimStart(), match: collapse(text.slice(start, end)), after: collapse(after).trimEnd(), cutBefore, cutAfter };
  }
  return null;
}
