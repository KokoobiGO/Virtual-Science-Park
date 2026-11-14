/**
 * Health check for the data sources (A19).
 *
 *   npx tsx --env-file-if-exists=.env.local scripts/sources-status.ts
 *
 * Reads DATABASE_URL from .env.local. Prints one line per row of source_status:
 * key, label, verdict (ok, stale, cached, hand_entered), items, the last
 * success (or the date of the cached copy) in Swedish time, and the message.
 */
import { closeDb } from "../lib/db";
import { sourceHealth, type SourceHealth } from "../lib/sources/health";

const swedishTime = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", dateStyle: "short", timeStyle: "short" });

function when(entry: SourceHealth): string {
  if (entry.verdict === "cached") return entry.cachedAt ? `copy from ${swedishTime.format(entry.cachedAt)}` : "copy date unknown";
  return entry.lastSuccessAt ? `last success ${swedishTime.format(entry.lastSuccessAt)}` : "never succeeded";
}

async function main() {
  const entries = await sourceHealth();
  if (!entries.length) {
    console.log("No source has a status yet. Run the member import and the collectors first.");
    return;
  }

  const items = (n: number | null) => (n === null ? "? items" : `${n} ${n === 1 ? "item" : "items"}`);
  const columns = entries.map((e) => [e.source, e.label, e.verdict, items(e.itemCount), when(e), e.message ?? ""]);
  const widths = columns[0].slice(0, -1).map((_, i) => Math.max(...columns.map((c) => c[i].length)));
  for (const c of columns) console.log([...c.slice(0, -1).map((v, i) => v.padEnd(widths[i])), c.at(-1)].join("  ").trimEnd());
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeDb);
