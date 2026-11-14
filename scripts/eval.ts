/**
 * Runs the evals (A21) and stores one eval_runs row per eval, for the Trust
 * report. The evals live in lib/eval/ (see lib/eval/index.ts).
 *
 *   npx tsx --env-file-if-exists=.env.local scripts/eval.ts [name ...] [--dry]
 *
 *   name    run only these evals (profile_accuracy, quote_check); none: all
 *   --dry   print the results, store nothing
 *
 * Prints a short table per eval, then the ids of the stored rows. An eval that
 * fails is reported and the others still run; the exit code is 1 then.
 */
import { execFileSync } from "node:child_process";
import { closeDb, getDb } from "../lib/db";
import { evalRuns } from "../lib/db/schema";
import { EVALS } from "../lib/eval";

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const flags = args.filter((a) => a.startsWith("--") && a !== "--dry");
  const names = args.filter((a) => !a.startsWith("--"));
  const unknown = [...flags, ...names.filter((name) => !EVALS.some((e) => e.kind === name))];
  if (unknown.length) {
    throw new Error(`Unknown: ${unknown.join(", ")}. Evals: ${EVALS.map((e) => `${e.kind} (${e.description})`).join("; ")}. Flag: --dry.`);
  }
  const chosen = names.length ? EVALS.filter((e) => names.includes(e.kind)) : EVALS;

  const sha = gitSha();
  const stored: { kind: string; id: string }[] = [];
  const failed: string[] = [];
  for (const definition of chosen) {
    console.log(`\n${definition.kind}`);
    try {
      const { kind, summary, details, table } = await definition.run();
      for (const line of table) console.log(`  ${line}`);
      if (dry) continue;
      const [row] = await getDb().insert(evalRuns).values({ kind, gitSha: sha, summary, details }).returning({ id: evalRuns.id });
      stored.push({ kind, id: row.id });
    } catch (error) {
      failed.push(definition.kind);
      console.error(`  failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log("");
  if (dry) console.log("Dry run: nothing stored.");
  for (const row of stored) console.log(`Stored eval_runs ${row.id} (${row.kind}, git ${sha ?? "unknown"})`);
  if (failed.length) {
    console.error(`Failed: ${failed.join(", ")}`);
    process.exitCode = 1;
  }
}

function gitSha(): string | null {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null;
  } catch {
    return null;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeDb);
