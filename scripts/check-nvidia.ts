/**
 * One working test call per NVIDIA API feature the plan relies on (S2, S3).
 *
 *   npm run check:nvidia
 *
 * Reads NVIDIA_API_KEY from .env.local. The same checks run on the deploy, with
 * Netlify's environment variables, at /staff/checks. Uses a few free-tier
 * requests: one model list, one fast-model call and three main-model calls.
 */
import { keyHint, NVIDIA_CHECKS, runNvidiaCheck, type CheckResult, type NvidiaCheckId } from "../lib/nvidia-checks";
import { nvidiaBaseUrl } from "../lib/nvidia";

async function main() {
  if (!process.env.NVIDIA_API_KEY) {
    console.error("NVIDIA_API_KEY is not set. Add it to .env.local (see .env.example) and run again.");
    process.exitCode = 1;
    return;
  }
  console.log(`NVIDIA API at ${nvidiaBaseUrl()} (plain fetch, no SDK)\n`);

  const results: CheckResult[] = [];
  for (const id of Object.keys(NVIDIA_CHECKS) as NvidiaCheckId[]) results.push(await runNvidiaCheck(id));

  for (const r of results) console.log(`${r.status.padEnd(4)}  ${r.feature}\n      ${r.detail}`);
  const hint = keyHint(results);
  if (hint) console.log(`\n${hint}`);
  if (results.some((r) => r.status === "FAIL")) process.exitCode = 1;
}

main();
