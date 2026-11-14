/**
 * Reading posts from a WordPress REST API (`/wp-json/wp/v2/...`), shared by
 * the Tech Concept Lab and BSP news collectors.
 *
 * We ask for `_fields=id,date_gmt,link,title,content` only, so the answer stays
 * small. Titles and content are HTML and must be turned into plain text.
 */
import * as cheerio from "cheerio/slim";
import { z } from "zod";

export const WP_FIELDS = "id,date_gmt,link,title,content";

export const WpPost = z.object({
  id: z.number().int(),
  /** UTC without an offset, e.g. "2026-10-20T05:28:52". */
  date_gmt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/),
  link: z.url(),
  title: z.object({ rendered: z.string() }),
  content: z.object({ rendered: z.string() }),
});
export type WpPost = z.infer<typeof WpPost>;

export const WpPosts = z.array(WpPost);

/** The post's publication time as a Date. */
export const publishedDate = (post: WpPost) => new Date(`${post.date_gmt}Z`);

/** Characters nobody sees: soft hyphen, zero-width space/joiners, word joiner, BOM. */
const INVISIBLE = /[­​-‍⁠﻿]/g;

const BLOCKS = "p, div, li, ul, ol, h1, h2, h3, h4, h5, h6, tr, td, th, table, section, article, blockquote, figure, figcaption, header, footer";

/** HTML to plain text on one line: blocks become spaces, entities are decoded. */
export function htmlToText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, iframe, svg, template").remove();
  $("br").replaceWith(" ");
  // Without this, "<p>a</p><p>b</p>" would read "ab".
  $(BLOCKS).each((_, el) => {
    $(el).prepend(" ").append(" ");
  });
  return $.root().text().replace(INVISIBLE, "").replace(/\s+/g, " ").trim();
}

/** A WordPress title ("R&amp;D &#8211; news") as plain text ("R&D – news"). */
export const titleText = (rendered: string) => htmlToText(rendered);

/** Cut text to at most `max` characters, at a word break, ending with an ellipsis. */
export function clip(text: string, max = 2000): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.8 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
