/**
 * HTML in, clean text out (A1). The text is what the profiler reads and what
 * quotes are checked against, so it keeps the page's own words and language.
 *
 * Readability finds the main content of article-like pages. Company home
 * pages are often not article-like and Readability keeps only one block of
 * them, so when it keeps less than half of the page's text we use the whole
 * body instead (menus, footers and cookie banners removed).
 */
import { Readability } from "@mozilla/readability";
// "cheerio/slim", not "cheerio": the main entry loads its own undici, which takes over Node's
// built-in fetch and now and then crashes the process (an assert in undici's client-h1).
import * as cheerio from "cheerio/slim";
import { parseHTML } from "linkedom";
import type { QuoteLang } from "../schemas";

export type ExtractedPage = {
  title: string | null;
  text: string;
  lang: QuoteLang;
  /** Which path produced the text. */
  method: "readability" | "body";
};

const NOT_CONTENT =
  "script, style, noscript, template, svg, iframe, nav, header, footer, form, aside, dialog, [hidden], [aria-hidden=true], [id*=cookie i], [class*=cookie i]";
const BLOCKS =
  "p, div, section, article, main, li, ul, ol, h1, h2, h3, h4, h5, h6, tr, td, th, table, blockquote, pre, figure, figcaption, dt, dd, address";

/** Text with one blank line between blocks, so words from two blocks never run together. */
function htmlToText(html: string): string {
  const $ = cheerio.load(html);
  $(NOT_CONTENT).not("html, body").remove();
  $("br").replaceWith("\n");
  $(BLOCKS).each((_, el) => {
    $(el).before("\n\n").after("\n\n");
  });
  // The slim parser adds no <body> around a fragment (Readability's output is one): use everything then.
  $("head").remove();
  const body = $("body");
  return (body.length ? body.text() : $.root().text())
    .normalize("NFC")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const SWEDISH = /\b(och|att|är|för|med|som|på|av|till|det|vi|inte|eller|våra|vår)\b/g;
const ENGLISH = /\b(the|and|of|to|is|for|with|that|our|we|are|your|from|this)\b/g;

/**
 * Swedish or English by counting common words; the page's lang attribute only
 * decides when the text is too short to tell (it is often wrong).
 */
export function detectLang(text: string, htmlLang?: string): QuoteLang {
  const lower = text.toLowerCase();
  const sv = lower.match(SWEDISH)?.length ?? 0;
  const en = lower.match(ENGLISH)?.length ?? 0;
  if (Math.max(sv, en) >= 3 && sv !== en) return sv > en ? "sv" : "en";
  const declared = htmlLang?.toLowerCase() ?? "";
  if (declared.startsWith("sv")) return "sv";
  if (declared.startsWith("en")) return "en";
  return "other";
}

export function extractPage(html: string): ExtractedPage {
  const $ = cheerio.load(html);
  const pageTitle = $("title").first().text().replace(/\s+/g, " ").trim();
  const body = htmlToText(html);

  let readable = "";
  let readableTitle: string | null | undefined;
  try {
    const article = new Readability(parseHTML(html).document).parse();
    readable = article?.content ? htmlToText(article.content) : "";
    readableTitle = article?.title;
  } catch {
    // Readability gave up on this markup: the body text below still works.
  }

  const useReadable = readable.length > 0 && readable.length >= body.length / 2;
  const text = useReadable ? readable : body;
  return {
    title: pageTitle || readableTitle?.trim() || null,
    text,
    lang: detectLang(text, $("html").attr("lang")),
    method: useReadable ? "readability" : "body",
  };
}
