/**
 * Find possible connections between members (A28) from the command line, with
 * the same functions the find-connections job uses.
 *
 *   npx tsx --env-file-if-exists=.env.local scripts/connections.ts --dry --limit 6
 *   npx tsx --env-file-if-exists=.env.local scripts/connections.ts
 *
 * Judges the candidate pairs two at a time and prints each verdict as it
 * goes. Without `--dry` it then stores the pairs that passed (replacing every
 * pair stored before) and prints the stored pairs. `--limit N` judges only the
 * N most similar pairs. Reads DATABASE_URL and ANTHROPIC_API_KEY from .env.local.
 *
 * A rate limit (429) from Claude is waited out: 30 s, then 60 s, and so on,
 * six times at most for the same two pairs.
 */
import { CONNECTION_DISCLAIMER } from "../lib/connections";
import { listCandidates } from "../lib/connections/candidates";
import { connectionsToStore, judgeCandidates, PAIRS_PER_STEP, summarize, type PairVerdict } from "../lib/connections/find";
import { listStoredConnections, storeConnections } from "../lib/connections/store";
import { closeDb } from "../lib/db";
import { ModelApiError } from "../lib/model";

const MAX_ATTEMPTS = 6;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function numberFlag(args: string[], name: string): number | undefined {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const value = Number(args[i + 1]);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} needs a positive whole number.`);
  return value;
}

function printVerdict(v: PairVerdict, index: number, total: number) {
  const head = `[${index}/${total}] ${v.similarity.toFixed(3)}  ${v.companyAName} + ${v.companyBName}: ${v.outcome.toUpperCase()}`;
  const time = v.seconds ? `  (${v.seconds} s, ${v.usage.inputTokens} in / ${v.usage.outputTokens} out)` : "";
  console.log(head + time);
  if (v.outcome === "passed") {
    console.log(`    labels: ${v.sharedOn.join("; ")}`);
    console.log(`    basis:  ${v.basis}`);
    for (const e of v.evidence) console.log(`    - ${e.companyId === v.companyAId ? v.companyAName : v.companyBName} / ${e.field}: ${e.value}`);
  } else {
    if (v.reason) console.log(`    ${v.check ?? "why"}: ${v.reason}`);
    if (v.outcome === "failed" && v.basis) console.log(`    basis was: ${v.basis}\n    labels were: ${v.sharedOn.join("; ")}  cited A ${v.cited.A.join(",")} B ${v.cited.B.join(",")}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const limit = numberFlag(args, "--limit");
  const started = Date.now();

  const candidates = await listCandidates({ limit });
  console.log(`candidates: ${candidates.length}${limit ? ` (limit ${limit})` : ""}${dry ? ", dry run: nothing is stored" : ""}\n`);

  const verdicts: PairVerdict[] = [];
  let rateLimits = 0;
  for (let i = 0; i < candidates.length; i += PAIRS_PER_STEP) {
    const pairs = candidates.slice(i, i + PAIRS_PER_STEP);
    for (let attempt = 1; ; attempt++) {
      try {
        const part = await judgeCandidates(pairs);
        part.forEach((v, j) => printVerdict(v, i + j + 1, candidates.length));
        verdicts.push(...part);
        break;
      } catch (error) {
        if (!(error instanceof ModelApiError && error.status === 429) || attempt >= MAX_ATTEMPTS) throw error;
        rateLimits++;
        const waitS = 30 * attempt;
        console.log(`  rate limited on pairs ${i + 1}-${i + pairs.length} (attempt ${attempt}): ${error.message.slice(0, 160)}; waiting ${waitS} s`);
        await sleep(waitS * 1000);
      }
    }
  }

  const summary = summarize(verdicts);
  const seconds = Math.round((Date.now() - started) / 1000);
  console.log(
    `\n${summary.candidates} candidates, ${summary.judged} judged, ${summary.plausible} said plausible, ${summary.passed} passed the checks` +
      `\n  rejected by the judge: ${summary.rejected}; failed a check: ${summary.failed} ${JSON.stringify(summary.failedChecks)}; skipped: ${summary.skipped}` +
      `\n  tokens: ${summary.tokens.input} in / ${summary.tokens.output} out; rate limits: ${rateLimits}; ${seconds} s`,
  );
  if (dry) return;

  const saved = await storeConnections(connectionsToStore(verdicts));
  console.log(`\nstored ${saved.stored} pairs, deleted ${saved.deleted} older ones\n`);
  console.log(`${CONNECTION_DISCLAIMER}\n`);
  for (const c of await listStoredConnections()) {
    console.log(`${c.companyA} + ${c.companyB}  (score ${c.score.toFixed(3)})`);
    console.log(`  labels: ${c.sharedOn.join("; ")}`);
    console.log(`  basis:  ${c.basis}`);
    for (const e of c.evidence) console.log(`  - ${e.companyId === c.companyAId ? c.companyA : c.companyB} / ${e.field}: ${e.value}  (claim ${e.claimId})`);
    console.log("");
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeDb);
