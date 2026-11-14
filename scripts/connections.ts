/**
 * Find possible connections between members (A28) from the command line, with
 * the same functions the find-connections job uses.
 *
 *   npx tsx --env-file-if-exists=.env.local scripts/connections.ts --dry --limit 6
 *   npx tsx --env-file-if-exists=.env.local scripts/connections.ts --dry --out run1.json
 *   npx tsx --env-file-if-exists=.env.local scripts/connections.ts --store-from run1.json
 *   npx tsx --env-file-if-exists=.env.local scripts/connections.ts
 *
 * Judges the candidate pairs one at a time, at most one call every
 * `--every S` seconds (default 10, so about 6 calls a minute on NVIDIA's
 * shared free key), and prints each verdict as it goes. Without `--dry` it then
 * stores the pairs that passed (replacing every pair stored before) and prints
 * the stored pairs. `--limit N` judges only the first N pairs. `--out FILE`
 * writes every verdict to a JSON file; `--store-from FILE` stores the passed
 * pairs of such a file without any model call, so a dry run that was read and
 * found good can be stored as it is. `--candidates` only lists the candidate
 * pairs, with no model call. `--recheck FILE` judges again only the pairs
 * that passed or failed a check in that file, and every third rejected one,
 * to see whether the verdicts hold between runs. Reads DATABASE_URL and NVIDIA_API_KEY from
 * .env.local.
 *
 * A rate limit (429) from NVIDIA is waited out: 60 s, six times at most for
 * the same pair.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { CONNECTION_DISCLAIMER } from "../lib/connections";
import { listCandidates } from "../lib/connections/candidates";
import { connectionsToStore, judgeCandidates, summarize, type PairVerdict } from "../lib/connections/find";
import { listStoredConnections, storeConnections } from "../lib/connections/store";
import { closeDb } from "../lib/db";
import { NvidiaApiError } from "../lib/nvidia";

const MAX_ATTEMPTS = 6;
const RATE_LIMIT_WAIT_S = 60;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function numberFlag(args: string[], name: string): number | undefined {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const value = Number(args[i + 1]);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} needs a positive whole number.`);
  return value;
}

function stringFlag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const value = args[i + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} needs a file name.`);
  return value;
}

function printVerdict(v: PairVerdict, index: number, total: number) {
  const head = `[${index}/${total}] ${v.similarity.toFixed(3)} ${v.reasons.join("+")}  ${v.companyAName} + ${v.companyBName}: ${v.outcome.toUpperCase()}`;
  const time = v.seconds ? `  (${v.seconds} s, ${v.usage.inputTokens} in / ${v.usage.outputTokens} out)` : "";
  console.log(head + time);
  if (v.outcome === "passed") {
    console.log(`    labels: ${v.sharedOn.join("; ")}`);
    console.log(`    basis:  ${v.basis}`);
    console.log(`    first step for BSP staff: ${v.firstStep}`);
    for (const e of v.evidence) console.log(`    - ${e.companyId === v.companyAId ? v.companyAName : v.companyBName} / ${e.field}: ${e.value}`);
  } else {
    if (v.reason) console.log(`    ${v.check ?? "why"}: ${v.reason}`);
    if (v.outcome === "failed" && v.basis) {
      console.log(`    basis was: ${v.basis}\n    first step was: ${v.firstStep}\n    labels were: ${v.sharedOn.join("; ")}  cited A ${v.cited.A.join(",")} B ${v.cited.B.join(",")}`);
    }
  }
}

async function store(verdicts: readonly PairVerdict[]) {
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

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const limit = numberFlag(args, "--limit");
  const everyS = numberFlag(args, "--every") ?? 10;
  const out = stringFlag(args, "--out");
  const storeFrom = stringFlag(args, "--store-from");
  const started = Date.now();

  if (storeFrom) {
    const saved = JSON.parse(readFileSync(storeFrom, "utf8")) as { verdicts: PairVerdict[] };
    console.log(`${saved.verdicts.length} verdicts read from ${storeFrom}; ${summarize(saved.verdicts).passed} passed`);
    if (!dry) await store(saved.verdicts);
    return;
  }

  let candidates = await listCandidates({ limit });
  const recheck = stringFlag(args, "--recheck");
  if (recheck) {
    // A second run for the stability check: the pairs that passed or failed a check last time, and every third rejected one.
    const previous = (JSON.parse(readFileSync(recheck, "utf8")) as { verdicts: PairVerdict[] }).verdicts;
    const key = (p: { companyAId: string; companyBId: string }) => `${p.companyAId}|${p.companyBId}`;
    const again = new Set(previous.filter((v) => v.outcome === "passed" || v.outcome === "failed").map(key));
    previous.filter((v) => v.outcome === "rejected").forEach((v, i) => i % 3 === 0 && again.add(key(v)));
    candidates = candidates.filter((c) => again.has(key(c)));
    console.log(`recheck of ${recheck}: ${again.size} pairs asked for, ${candidates.length} still candidates`);
  }
  const sources = { similar: 0, role: 0, opportunity: 0 };
  for (const c of candidates) for (const r of c.reasons) sources[r]++;
  console.log(
    `candidates: ${candidates.length}${limit ? ` (limit ${limit})` : ""}; by source (a pair can have two): ${Object.entries(sources)
      .map(([k, n]) => `${k} ${n}`)
      .join(", ")}${dry ? "; dry run: nothing is stored" : ""}\n`,
  );
  if (args.includes("--candidates")) {
    candidates.forEach((c, i) =>
      console.log(`${String(i + 1).padStart(3)} ${c.similarity.toFixed(3)} ${c.reasons.join("+").padEnd(20)} ${c.companyAName} + ${c.companyBName}${c.sharedOpportunities.length ? `  [${c.sharedOpportunities.map((o) => o.title.slice(0, 40)).join(" | ")}]` : ""}`),
    );
    return;
  }

  const verdicts: PairVerdict[] = [];
  let rateLimits = 0;
  let lastCall = 0;
  for (let i = 0; i < candidates.length; i++) {
    for (let attempt = 1; ; attempt++) {
      const wait = lastCall + everyS * 1000 - Date.now();
      if (wait > 0) await sleep(wait);
      lastCall = Date.now();
      try {
        const [verdict] = await judgeCandidates([candidates[i]]);
        printVerdict(verdict, i + 1, candidates.length);
        verdicts.push(verdict);
        // Written after every pair, so a run that is stopped halfway still leaves its verdicts.
        if (out) writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), sources, summary: summarize(verdicts), verdicts }, null, 2));
        // A pair skipped without a call does not count against the rate.
        if (verdict.outcome === "skipped") lastCall = 0;
        break;
      } catch (error) {
        if (!(error instanceof NvidiaApiError && error.status === 429) || attempt >= MAX_ATTEMPTS) throw error;
        rateLimits++;
        console.log(`  rate limited on pair ${i + 1} (attempt ${attempt}): ${error.message.slice(0, 160)}; waiting ${RATE_LIMIT_WAIT_S} s`);
        await sleep(RATE_LIMIT_WAIT_S * 1000);
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
  if (out) {
    writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), sources, summary, verdicts }, null, 2));
    console.log(`verdicts written to ${out}`);
  }
  if (dry) return;
  await store(verdicts);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeDb);
