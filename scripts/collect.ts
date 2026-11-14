/**
 * Run one collector, or all of them, from the command line.
 *
 *   npm run collect -- vinnova --dry     print what it finds, store nothing
 *   npm run collect -- vinnova           store the opportunities
 *   npm run collect -- all               every collector, one after another
 *
 * Storing reads DATABASE_URL from .env.local. A dry run needs no database.
 */
import { COLLECTORS, getCollector } from "../lib/collectors";
import { storeCollected } from "../lib/collectors/store";
import { closeDb } from "../lib/db";

async function main() {
  const args = process.argv.slice(2);
  const name = args.find((a) => !a.startsWith("--"));
  const dry = args.includes("--dry");
  if (!name) {
    console.error(`Usage: npm run collect -- <source|all> [--dry]\nSources: ${COLLECTORS.map((c) => c.source).join(", ")}`);
    process.exitCode = 1;
    return;
  }

  for (const collector of name === "all" ? COLLECTORS : [getCollector(name)]) {
    try {
      const result = await collector.collect();
      console.log(`${collector.source}: ${result.items.length} items, ${result.state}${result.message ? ` (${result.message})` : ""}`);
      if (dry) {
        for (const item of result.items) {
          const date = item.deadline ?? item.eventDate ?? "no date";
          console.log(`  ${item.kind.padEnd(8)} ${date.slice(0, 10).padEnd(10)}  ${item.title.slice(0, 90)}`);
        }
      } else {
        const stored = await storeCollected(collector, result);
        console.log(`  stored: ${stored.inserted} new, ${stored.updated} updated`);
      }
    } catch (error) {
      console.error(`${collector.source}: FAILED: ${(error as Error).message}`);
      process.exitCode = 1;
    }
  }
}

main()
  .catch((error) => {
    console.error((error as Error).message);
    process.exitCode = 1;
  })
  .finally(closeDb);
