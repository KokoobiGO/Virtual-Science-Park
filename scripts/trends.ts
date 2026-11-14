/**
 * Write this week's trend notes (A27) from the command line, with the same
 * functions the trend-notes job uses.
 *
 *   tsx scripts/trends.ts --dry              write and print every area's note; store nothing
 *   tsx scripts/trends.ts marine cyber --dry  only these areas
 *   tsx scripts/trends.ts                    write and store every area's note for this week
 *
 * Reads DATABASE_URL and NVIDIA_API_KEY from .env.local (run it with
 * --env-file-if-exists=.env.local). Storing replaces the area's note for this
 * week, if there is one. One model call per area, two when the first note
 * fails its checks.
 */
import { closeDb } from "../lib/db";
import { OpportunityTag } from "../lib/schemas";
import { emptyTrendUsage, trendNoteForArea, weekOf, type TrendOutcome } from "../lib/trends";

function parseArgs(args: string[]) {
  const dry = args.includes("--dry");
  const unknownFlags = args.filter((arg) => arg.startsWith("--") && arg !== "--dry");
  if (unknownFlags.length) throw new Error(`Unknown option ${unknownFlags.join(", ")}. Use --dry or nothing.`);
  const named = args.filter((arg) => !arg.startsWith("--"));
  const unknown = named.filter((arg) => !OpportunityTag.safeParse(arg).success);
  if (unknown.length) throw new Error(`Unknown area ${unknown.join(", ")}. The areas are ${OpportunityTag.options.join(", ")}.`);
  return { dry, areas: named.length ? (named as OpportunityTag[]) : OpportunityTag.options };
}

function print(outcome: TrendOutcome) {
  console.log(`\n=== ${outcome.area} (${outcome.inputs.length} inputs) ===`);
  for (const input of outcome.inputs) console.log(`  ${input.id.padEnd(3)} ${input.kind.padEnd(7)} ${input.source}: ${input.title.slice(0, 100)}`);
  if (outcome.status === "too_few_inputs") {
    console.log("  no note: fewer than 2 new inputs this week");
    return;
  }
  if (outcome.status === "failed_checks") {
    console.log(`  no note: failed the checks after ${outcome.attempts} attempts (${outcome.seconds} s)`);
    for (const problem of outcome.problems) console.log(`    - ${problem}`);
    if (outcome.rejected) console.log(`  rejected note (cites ${outcome.rejected.cited.join(", ")}):\n    ${outcome.rejected.title}\n    ${outcome.rejected.body}`);
    return;
  }
  console.log(`\n  ${outcome.title}\n\n  ${outcome.body}\n`);
  console.log(`  cites ${outcome.cited.join(", ")}; ${outcome.attempts} attempt${outcome.attempts > 1 ? "s" : ""}, ${outcome.seconds} s${outcome.stored ? `; stored ${outcome.stored.id}` : ""}`);
  for (const source of outcome.sources) console.log(`    ${source.title.slice(0, 90)}\n      ${source.url}`);
}

async function main() {
  const { dry, areas } = parseArgs(process.argv.slice(2));
  const now = new Date();
  console.log(`Week of ${weekOf(now)}: ${areas.join(", ")}${dry ? " (dry run: nothing is stored)" : ""}`);

  const usage = emptyTrendUsage();
  const counts = { written: 0, too_few_inputs: 0, failed_checks: 0, error: 0 };
  for (const area of areas) {
    // One area's API error (a 429, a 502) must not stop the others, as in the job.
    try {
      const outcome = await trendNoteForArea(area, { now, store: !dry, usage });
      counts[outcome.status]++;
      print(outcome);
    } catch (error) {
      counts.error++;
      console.log(`\n=== ${area} ===\n  error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.log(
    `\n${counts.written} written${dry ? "" : " and stored"}, ${counts.too_few_inputs} with too few inputs, ${counts.failed_checks} failed the checks, ${counts.error} errors; ${usage.calls} model calls, ${usage.inputTokens} input and ${usage.outputTokens} output tokens`,
  );
  if (counts.error) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeDb);
