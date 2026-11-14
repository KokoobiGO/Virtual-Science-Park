/**
 * Runs the evals (A21) and stores one eval_runs row per eval, for the Trust
 * report. The evals live in lib/eval/ (see lib/eval/index.ts).
 *
 *   npx tsx --env-file-if-exists=.env.local scripts/eval.ts [name ...] [--dry] [--option=value ...]
 *
 *   name    run only these evals (profile_accuracy, quote_check, red_team); none:
 *           all but red_team (about 150 model calls and 15 minutes, so only by name)
 *   --dry   print the results, store nothing
 *   --group=<id>, --case=<id>
 *           red_team only: run one group or one case; printed, never stored
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
  const names = args.filter((a) => !a.startsWith("--"));
  const chosen = names.length ? EVALS.filter((e) => names.includes(e.kind)) : EVALS.filter((e) => !e.byNameOnly);
  // --name=value options, for the evals that take them.
  const options: Record<string, string> = {};
  const accepted = new Set(chosen.flatMap((e) => Object.keys(e.options ?? {})));
  const flags = args.filter((a) => a.startsWith("--") && a !== "--dry");
  for (const flag of flags) {
    const [, name, value] = flag.match(/^--([a-z]+)=(.+)$/) ?? [];
    if (name && accepted.has(name)) options[name] = value;
  }
  const unknown = [...flags.filter((f) => !accepted.has(f.match(/^--([a-z]+)=/)?.[1] ?? "")), ...names.filter((name) => !EVALS.some((e) => e.kind === name))];
  if (unknown.length) {
    const optionHelp = EVALS.flatMap((e) => Object.entries(e.options ?? {}).map(([name, what]) => `--${name}=... (${e.kind}: ${what})`));
    throw new Error(`Unknown: ${unknown.join(", ")}. Evals: ${EVALS.map((e) => `${e.kind} (${e.description})`).join("; ")}. Flags: --dry${optionHelp.length ? `, ${optionHelp.join(", ")}` : ""}.`);
  }

  const sha = gitSha();
  const stored: { kind: string; id: string }[] = [];
  const failed: string[] = [];
  for (const definition of chosen) {
    console.log(`\n${definition.kind}`);
    try {
      const { kind, summary, details, table, partial } = await definition.run(options);
      for (const line of table) console.log(`  ${line}`);
      if (dry) continue;
      if (partial) {
        console.log(`  Part of ${kind} only: not stored.`);
        continue;
      }
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
