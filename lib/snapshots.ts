/**
 * A URL in, a stored snapshot out (A1). Jobs and scripts only: it writes with
 * getDb(), which bypasses row-level security.
 *
 * Quotes are checked against snapshots.content_text, so a stored snapshot is
 * never changed. A page whose text is the same as last time gives the existing
 * row back instead of a copy.
 */
import { createHash } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { getDb } from "./db";
import { snapshots } from "./db/schema";
import { extractPage } from "./fetcher/extract";
import { fetchPage, FetchPageError } from "./fetcher/fetch-page";

export type Snapshot = typeof snapshots.$inferSelect;

/** Below this a page has no real text: most often it is drawn by JavaScript. */
const MIN_TEXT_CHARS = 50;

export async function fetchSnapshot(input: {
  url: string;
  /** Where it came from, e.g. "bsp_member", "company_site", "vinnova". */
  source: string;
  companyId?: string | null;
}): Promise<{ snapshot: Snapshot; unchanged: boolean; method: "readability" | "body" }> {
  const page = await fetchPage(input.url);
  const { title, text, lang, method } = extractPage(page.html);
  if (text.length < MIN_TEXT_CHARS) {
    throw new FetchPageError(`${page.url} has no readable text (${text.length} characters). It may need JavaScript.`);
  }
  const contentHash = createHash("sha256").update(text).digest("hex");

  const db = getDb();
  const [latest] = await db
    .select()
    .from(snapshots)
    .where(eq(snapshots.url, page.url))
    .orderBy(desc(snapshots.retrievedAt))
    .limit(1);
  if (latest?.contentHash === contentHash) return { snapshot: latest, unchanged: true, method };

  const [snapshot] = await db
    .insert(snapshots)
    .values({
      companyId: input.companyId ?? null,
      source: input.source,
      url: page.url,
      title,
      contentText: text,
      contentHash,
      lang,
      httpStatus: page.status,
    })
    .returning();
  return { snapshot, unchanged: false, method };
}
