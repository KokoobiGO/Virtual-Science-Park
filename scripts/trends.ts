/**
 * Write this week's trend notes (A27) from the command line, with the same
 * functions the trend-notes job uses.
 *
 *   tsx scripts/trends.ts --dry              write and print every area's note; store nothing
 *   tsx scripts/trends.ts marine cyber --dry  only these areas
 *   tsx scripts/trends.ts                    write and store every area's note for this week
 *   tsx scripts/trends.ts --dry --out notes.json        also write every outcome to a JSON file
 *   tsx scripts/trends.ts --store-from notes.json       store the notes of such a file, no model call
 *
 * `--store-from` stores exactly the notes a dry run wrote and someone read,
 * and only when the file is from this week.
 *
 * Reads DATABASE_URL and NVIDIA_API_KEY from .env.local (run it with
 * --env-file-if-exists=.env.local). Storing replaces the area's note for this
 * week, if there is one. One model call per area, two when the first note
 * fails its checks. Areas run one after the other with a 20 s pause, and a
 * rate limit (429) is waited out for 60 s, so the shared free key sees about
 * six calls a minute at most.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { closeDb } from "../lib/db";
import { NvidiaApiError } from "../lib/nvidia";
import { OpportunityTag } from "../lib/schemas";
import { emptyTrendUsage, trendNoteForArea, weekOf, type TrendOutcome } from "../lib/trends";
import { storeNote } from "../lib/trends/store";

const AREA_PAUSE_MS = 20_000;
const MAX_ATTEMPTS = 6;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function fileFlag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const value = args[i + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} needs a file name.`);
  return value;
}

function parseArgs(args: string[]) {
  const dry = args.includes("--dry");
  const out = fileFlag(args, "--out");
  const storeFrom = fileFlag(args, "--store-from");
  const unknownFlags = args.filter((arg) => arg.startsWith("--") && !["--dry", "--out", "--store-from"].includes(arg));
  if (unknownFlags.length) throw new Error(`Unknown option ${unknownFlags.join(", ")}. Use --dry, --out FILE or --store-from FILE.`);
  const named = args.filter((arg, i) => !arg.startsWith("--") && !["--out", "--store-from"].includes(args[i - 1]));
  const unknown = named.filter((arg) => !OpportunityTag.safeParse(arg).success);
  if (unknown.length) throw new Error(`Unknown area ${unknown.join(", ")}. The areas are ${OpportunityTag.options.join(", ")}.`);
  return { dry, out, storeFrom, areas: named.length ? (named as OpportunityTag[]) : OpportunityTag.options };
}

function print(outcome: TrendOutcome) {
  console.log(`\n=== ${outcome.area} (${outcome.inputs.length} inputs) ===`);
  for (const input of outcome.inputs) console.log(`  ${input.id.padEnd(3)} ${input.fresh ? "new" : "   "} ${input.kind.padEnd(7)} ${input.source}: ${input.title.slice(0, 100)}`);
  if (outcome.status === "too_few_inputs") {
    console.log(`  no note: ${outcome.why}`);
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

async function storeFromFile(file: string, areas: readonly OpportunityTag[], now: Date) {
  const outcomes = JSON.parse(readFileSync(file, "utf8")) as TrendOutcome[];
  for (const outcome of outcomes) {
    if (outcome.status !== "written" || !areas.includes(outcome.area)) continue;
    if (outcome.weekOf !== weekOf(now)) throw new Error(`${file} holds notes for the week of ${outcome.weekOf}, not this week (${weekOf(now)}).`);
    const stored = await storeNote({ area: outcome.area, weekOf: outcome.weekOf, title: outcome.title, body: outcome.body, sources: outcome.sources });
    console.log(`stored ${outcome.area} (${stored.id}): ${outcome.title}`);
  }
}

async function main() {
  const { dry, out, storeFrom, areas } = parseArgs(process.argv.slice(2));
  const now = new Date();
  if (storeFrom) return storeFromFile(storeFrom, areas, now);
  console.log(`Week of ${weekOf(now)}: ${areas.join(", ")}${dry ? " (dry run: nothing is stored)" : ""}`);

  const usage = emptyTrendUsage();
  const counts = { written: 0, too_few_inputs: 0, failed_checks: 0, error: 0 };
  const outcomes: TrendOutcome[] = [];
  for (const [i, area] of areas.entries()) {
    if (i > 0) await sleep(AREA_PAUSE_MS);
    for (let attempt = 1; ; attempt++) {
      // One area's API error (a 502, a timeout) must not stop the others, as in the job; a 429 is waited out.
      try {
        const outcome = await trendNoteForArea(area, { now, store: !dry, usage });
        counts[outcome.status]++;
        outcomes.push(outcome);
        print(outcome);
      } catch (error) {
        if (error instanceof NvidiaApiError && error.status === 429 && attempt < MAX_ATTEMPTS) {
          console.log(`  rate limited on ${area} (attempt ${attempt}); waiting 60 s`);
          await sleep(60_000);
          continue;
        }
        counts.error++;
        console.log(`\n=== ${area} ===\n  error: ${error instanceof Error ? error.message : String(error)}`);
      }
      break;
    }
  }
  console.log(
    `\n${counts.written} written${dry ? "" : " and stored"}, ${counts.too_few_inputs} with too few inputs, ${counts.failed_checks} failed the checks, ${counts.error} errors; ${usage.calls} model calls, ${usage.inputTokens} input and ${usage.outputTokens} output tokens`,
  );
  if (out) writeFileSync(out, JSON.stringify(outcomes, null, 2));
  if (counts.error) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeDb);
