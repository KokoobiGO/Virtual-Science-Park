/**
 * One working test call per model feature the app relies on (S2, S3).
 *
 *   npm run check:models
 *
 * Reads ANTHROPIC_API_KEY from .env.local. The same checks run on the deploy,
 * with Netlify's environment variables, at /staff/checks. Costs well under one
 * US cent: two model lookups (free), one Haiku call and three small Sonnet calls.
 */
import { keyHint, MODEL_CHECKS, runModelCheck, type CheckResult, type ModelCheckId } from "../lib/model-checks";
import { MODEL_FOR } from "../lib/model";

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set. Add it to .env.local (see .env.example) and run again.");
    process.exitCode = 1;
    return;
  }
  console.log("Claude API (official SDK). Which step uses which model:");
  for (const [step, { model, effort }] of Object.entries(MODEL_FOR)) console.log(`  ${step.padEnd(12)} ${model}, effort ${effort}`);
  console.log("");

  const results: CheckResult[] = [];
  for (const id of Object.keys(MODEL_CHECKS) as ModelCheckId[]) results.push(await runModelCheck(id));

  for (const r of results) console.log(`${r.status.padEnd(4)}  ${r.feature}\n      ${r.detail}`);
  const hint = keyHint(results);
  if (hint) console.log(`\n${hint}`);
  if (results.some((r) => r.status === "FAIL")) process.exitCode = 1;
}

main();
