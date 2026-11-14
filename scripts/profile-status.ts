/**
 * How far profiling all members has come (A8).
 *
 *   npm run profile:status
 *
 * Reads DATABASE_URL from .env.local. Prints how many companies are profiled,
 * thin, failed or not profiled yet, then one line per thin or failed company
 * with the reason.
 */
import { closeDb, getDb } from "../lib/db";
import { companies } from "../lib/db/schema";

async function main() {
  const rows = await getDb()
    .select({ slug: companies.slug, status: companies.profileStatus, note: companies.profileNote })
    .from(companies)
    .orderBy(companies.slug);

  const counts = [
    ["profiled", rows.filter((r) => r.status === "profiled").length],
    ["thin", rows.filter((r) => r.status === "thin").length],
    ["failed", rows.filter((r) => r.status === "failed").length],
    ["not profiled yet", rows.filter((r) => r.status === null).length],
  ] as const;
  for (const [label, count] of counts) console.log(`${label.padEnd(16)} ${count}`);
  console.log(`${"total".padEnd(16)} ${rows.length}`);

  const flagged = rows.filter((r) => r.status === "thin" || r.status === "failed");
  if (!flagged.length) return;
  console.log("");
  const width = Math.max(...flagged.map((r) => r.slug.length));
  for (const r of flagged) console.log(`${r.slug.padEnd(width)}  ${r.status!.padEnd(6)}  ${r.note ?? ""}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeDb);
