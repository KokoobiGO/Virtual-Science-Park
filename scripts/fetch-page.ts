/**
 * Fetch one page and print the clean text the profiler would read (A1).
 *
 *   npm run fetch:page -- https://www.bluesciencepark.se/
 *   npm run fetch:page -- https://www.bluesciencepark.se/ --save
 *
 * Without --save nothing is stored and no database is needed. With --save the
 * snapshot goes to DATABASE_URL from .env.local.
 */
import { closeDb } from "../lib/db";
import { extractPage } from "../lib/fetcher/extract";
import { fetchPage } from "../lib/fetcher/fetch-page";
import { fetchSnapshot } from "../lib/snapshots";

async function main() {
  const args = process.argv.slice(2);
  const url = args.find((a) => !a.startsWith("--"));
  if (!url) {
    console.error("Usage: npm run fetch:page -- <url> [--save]");
    process.exitCode = 1;
    return;
  }

  if (args.includes("--save")) {
    const { snapshot, unchanged, method } = await fetchSnapshot({ url, source: "manual" });
    console.log(`${unchanged ? "Unchanged" : "Stored"} snapshot ${snapshot.id} (${method})`);
    console.log(`${snapshot.url}\n${snapshot.title} · ${snapshot.lang} · ${snapshot.contentText.length} characters\n`);
    console.log(snapshot.contentText);
    return;
  }

  const page = await fetchPage(url);
  const { title, text, lang, method } = extractPage(page.html);
  console.log(`${page.url} answered ${page.status} (${method})`);
  console.log(`${title} · ${lang} · ${text.length} characters\n`);
  console.log(text);
}

main()
  .catch((error) => {
    console.error((error as Error).message);
    process.exitCode = 1;
  })
  .finally(closeDb);
