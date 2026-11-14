/**
 * Build the "Your week" cards (A17) from the command line, with the same
 * functions the build-week-cards job uses. No model call.
 *
 *   tsx scripts/cards.ts embeddedart --dry     build and print; store nothing
 *   tsx scripts/cards.ts embeddedart malvacom  build, store and print these companies' cards
 *   tsx scripts/cards.ts                       every company with judged personal matches
 *
 * Reads DATABASE_URL from .env.local (run it with --env-file-if-exists=.env.local).
 * Storing replaces the company's cards for this week (Monday, Swedish time).
 */
import { buildWeekCards, companiesForCards, type BuiltWeekCards } from "../lib/cards/build";
import { closeDb } from "../lib/db";

function print(built: BuiltWeekCards) {
  const stored = built.stored === null ? "not stored" : `${built.stored} stored`;
  console.log(`\n${built.name} (${built.slug}), week of ${built.weekOf}: ${built.cards.length} cards, ${stored}`);
  for (const card of built.cards) {
    console.log(`  ${card.position}. [${card.kind}] ${card.title}`);
    console.log(`     why:  ${card.why}`);
    console.log(`     next: ${card.nextStep}`);
    if (card.uncertainties.length) console.log(`     open: ${card.uncertainties.join(" | ")}`);
    console.log(`     source: ${card.sources.map((s) => s.url).join(", ")}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const slugs = args.filter((arg) => !arg.startsWith("--"));
  const targets = await companiesForCards({ slugs });
  console.log(`${targets.length} companies${dry ? " (dry run: nothing is stored)" : ""}`);

  const total = { cards: 0, trend: 0, short: [] as string[] };
  for (const company of targets) {
    const built = await buildWeekCards(company, { dry });
    total.cards += built.cards.length;
    total.trend += built.cards.filter((c) => c.kind === "trend").length;
    if (built.cards.length < 5) total.short.push(`${built.slug} (${built.cards.length})`);
    // Print every card for a few companies; one line each for a full run.
    if (targets.length <= 5) print(built);
    else console.log(`${built.slug.padEnd(28)} ${built.cards.length} cards (${built.cards.map((c) => c.kind[0]).join("")}), week of ${built.weekOf}${built.stored === null ? "" : ", stored"}`);
  }
  console.log(
    `\n${total.cards} cards for ${targets.length} companies, ${total.trend} trend cards${total.short.length ? `; fewer than 5: ${total.short.join(", ")}` : ""}`,
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeDb);
