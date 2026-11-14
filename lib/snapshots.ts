/**
 * A URL in, a stored snapshot out (A1). Jobs and scripts only: it writes with
 * getDb(), which bypasses row-level security.
 *
 * Quotes are checked against snapshots.content_text, so a stored snapshot is
 * never changed. A page whose text is the same as last time gives the existing
 * row back instead of a copy.
 *
 * With DEMO_MODE=cached nothing is fetched (A19): the latest stored copy comes
 * back as unchanged, and a page that was never stored is an error.
 */
import { createHash } from "node:crypto";
import { and, desc, eq, inArray, type SQL } from "drizzle-orm";
import { isCachedMode } from "./collectors/cache";
import { getDb, type Db } from "./db";
import { snapshots } from "./db/schema";
import type { UserTx } from "./db/user";
import { extractPage } from "./fetcher/extract";
import { fetchPage, FetchPageError } from "./fetcher/fetch-page";

export type Snapshot = typeof snapshots.$inferSelect;

/** Below this a page has no real text: most often it is drawn by JavaScript. */
const MIN_TEXT_CHARS = 50;

type SnapshotRequest = {
  url: string;
  /** Where it came from, e.g. "bsp_member", "company_site", "vinnova". */
  source: string;
  companyId?: string | null;
};

async function latestSnapshot(where: SQL | undefined): Promise<Snapshot | undefined> {
  const [row] = await getDb().select().from(snapshots).where(where).orderBy(desc(snapshots.retrievedAt)).limit(1);
  return row;
}

/** The URL as given and as fetchPage() would store it ("https://x.se" is stored as "https://x.se/"). */
function urlForms(url: string): string[] {
  try {
    return [...new Set([url, new URL(url).href])];
  } catch {
    return [url];
  }
}

/** The latest stored copy of a page, for DEMO_MODE=cached. */
async function storedSnapshot(input: SnapshotRequest): Promise<Snapshot> {
  const stored =
    (await latestSnapshot(inArray(snapshots.url, urlForms(input.url)))) ??
    // A page that redirected is stored under the address it ended at: take the company's latest copy from the same source.
    (input.companyId ? await latestSnapshot(and(eq(snapshots.companyId, input.companyId), eq(snapshots.source, input.source))) : undefined);
  if (!stored) throw new FetchPageError(`DEMO_MODE=cached and no stored copy of ${input.url}`);
  return stored;
}

/** `db` is there so a test can pass a transaction; jobs leave it out and get the service client. */
export async function fetchSnapshot(
  input: SnapshotRequest,
  options: { db?: Db | UserTx } = {},
): Promise<{ snapshot: Snapshot; unchanged: boolean; method: "readability" | "body" | "stored" }> {
  if (isCachedMode()) return { snapshot: await storedSnapshot(input), unchanged: true, method: "stored" };

  const page = await fetchPage(input.url);
  const { title, text, lang, method } = extractPage(page.html);
  if (text.length < MIN_TEXT_CHARS) {
    throw new FetchPageError(`${page.url} has no readable text (${text.length} characters). It may need JavaScript.`);
  }
  const contentHash = createHash("sha256").update(text).digest("hex");

  const db = options.db ?? getDb();
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
