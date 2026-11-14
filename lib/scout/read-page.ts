/**
 * Scout's read_page tool (B3): one result page, fetched through the repo's
 * page fetcher (public http(s) only, 15 s, 5 MB), turned into clean text and
 * cut. Nothing is stored: a brief cites the URL and the date it was read.
 *
 * With DEMO_MODE=cached nothing is fetched: the latest stored snapshot of the
 * same URL is used when there is one, otherwise the page cannot be read.
 *
 * Jobs and scripts only (the cached path reads with getDb()).
 */
import { desc, inArray } from "drizzle-orm";
import { isCachedMode } from "../collectors/cache";
import { getDb } from "../db";
import { snapshots } from "../db/schema";
import { cutText } from "../embeddings/text";
import { extractPage } from "../fetcher/extract";
import { fetchPage, FetchPageError, type FetchedPage } from "../fetcher/fetch-page";
import type { PageRead } from "./types";

/** Text kept per page: enough for who may take part and how to get in touch. */
export const PAGE_TEXT_CHARS = 4000;

/** Below this a page has no real text (the same rule as lib/snapshots.ts). */
const MIN_TEXT_CHARS = 50;

export type ReadPageOptions = { fetch?: (url: string) => Promise<FetchedPage>; now?: Date; cached?: boolean };

const urlForms = (url: string) => {
  try {
    return [...new Set([url, new URL(url).href])];
  } catch {
    return [url];
  }
};

export async function readPage(url: string, options: ReadPageOptions = {}): Promise<PageRead> {
  const { fetch = fetchPage, now = new Date(), cached = isCachedMode() } = options;
  if (cached) {
    const [stored] = await getDb()
      .select({ url: snapshots.url, title: snapshots.title, text: snapshots.contentText, retrievedAt: snapshots.retrievedAt })
      .from(snapshots)
      .where(inArray(snapshots.url, urlForms(url)))
      .orderBy(desc(snapshots.retrievedAt))
      .limit(1);
    if (!stored) throw new FetchPageError(`DEMO_MODE=cached and no stored copy of ${url}`);
    const text = cutText(stored.text, PAGE_TEXT_CHARS);
    return { url: stored.url, title: stored.title, text, retrievedAt: stored.retrievedAt.toISOString(), chars: stored.text.length, stored: true };
  }

  const page = await fetch(url);
  const { title, text } = extractPage(page.html);
  if (text.length < MIN_TEXT_CHARS) throw new FetchPageError(`${page.url} has no readable text (${text.length} characters). It may need JavaScript.`);
  return { url: page.url, title, text: cutText(text, PAGE_TEXT_CHARS), retrievedAt: now.toISOString(), chars: text.length };
}
