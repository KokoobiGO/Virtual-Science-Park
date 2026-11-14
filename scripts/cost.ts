/**
 * What the agents use (A24): tokens per full run and per member per month,
 * from the real runs.
 *
 *   npm run cost
 *
 * Reads DATABASE_URL from .env.local. Nothing is written.
 *
 * The app runs on NVIDIA's free API, so the money cost is $0. What limits it
 * is the rate limit (roughly 30 to 45 requests a minute), so the script also
 * shows the model calls and how long one full run takes at that rate.
 *
 * Profiling and judging are summed from job_runs. Tagging, connections, trend
 * notes and embeddings were run as scripts on 2026-11-14 and did not record
 * their tokens there; their numbers are below.
 *
 * The monthly number is a worst case: every week every member is profiled
 * again, everything is tagged and embedded again, every match is judged again,
 * and there is one trend run and one connections run. Unchanged pages skip
 * the model, so real use is lower. Scout and Copilot (B stream) are not built
 * and are not in the number.
 */
import { count, inArray, sql } from "drizzle-orm";
import { closeDb, getDb } from "../lib/db";
import { companies, jobRuns } from "../lib/db/schema";

type Usage = { input: number; output: number; calls: number | null };

/** One full run each, measured on 2026-11-14 (script runs, not in job_runs). */
const MEASURED_BY_HAND = {
  /** Tagging 183 opportunities and 56 companies, one call each. */
  tagging: { input: 59_148, output: 13_051, calls: 239 },
  /** One connections run, 60 pairs. */
  connections: { input: 63_888, output: 6_790, calls: 60 },
  /** One weekly trend run, the top of the measured range; one call per area plus retries. */
  trends: { input: 35_000, output: 1_600, calls: 8 },
} satisfies Record<string, Usage>;

/** Voyage tokens for embedding the same 183 opportunities and 56 companies. Free up to 200 million. */
const EMBEDDING_TOKENS = 57_000;

/** NVIDIA's free key answers 429 above roughly this many requests a minute. */
const REQUESTS_PER_MINUTE = 30;
const WEEKS_PER_MONTH = 52 / 12;

async function usageOf(jobs: string[]): Promise<Usage & { runs: number }> {
  const [row] = await getDb()
    .select({
      runs: count(),
      input: sql<number>`coalesce(sum(${jobRuns.inputTokens}), 0)`.mapWith(Number),
      output: sql<number>`coalesce(sum(${jobRuns.outputTokens}), 0)`.mapWith(Number),
      calls: sql<number>`coalesce(sum((${jobRuns.stats}->>'calls')::int), 0)`.mapWith(Number),
    })
    .from(jobRuns)
    .where(inArray(jobRuns.job, jobs));
  return row;
}

const n = (value: number) => Math.round(value).toLocaleString("en-US");

async function main() {
  const [{ members }] = await getDb().select({ members: count() }).from(companies);
  const [profiling, judging] = await Promise.all([usageOf(["profile-company"]), usageOf(["judge-script", "judge-company"])]);

  const lines: { job: string; where: string; usage: Usage }[] = [
    // The profiler makes one call per run, and a second when a quote fails: runs is the floor.
    { job: `Profile ${members} members`, where: `job_runs, ${profiling.runs} runs`, usage: { ...profiling, calls: profiling.runs } },
    { job: "Tag opportunities + members", where: "script run", usage: MEASURED_BY_HAND.tagging },
    { job: "Judge every match", where: `job_runs, ${judging.runs} runs`, usage: judging },
    { job: "Connections, one run", where: "script run", usage: MEASURED_BY_HAND.connections },
    { job: "Trend notes, one week", where: "script run", usage: MEASURED_BY_HAND.trends },
  ];

  console.log("Model: NVIDIA's free API. Money cost: $0. Tokens as the model counted them.\n");
  console.log(`${"One full run of".padEnd(30)} ${"input".padStart(10)} ${"output".padStart(9)} ${"calls".padStart(6)}  source`);
  const total = { input: 0, output: 0, calls: 0 };
  for (const l of lines) {
    total.input += l.usage.input;
    total.output += l.usage.output;
    total.calls += l.usage.calls ?? 0;
    console.log(`${l.job.padEnd(30)} ${n(l.usage.input).padStart(10)} ${n(l.usage.output).padStart(9)} ${n(l.usage.calls ?? 0).padStart(6)}  ${l.where}`);
  }
  console.log(`${"Embeddings (Voyage)".padEnd(30)} ${n(EMBEDDING_TOKENS).padStart(10)} ${"".padStart(9)} ${"".padStart(6)}  free (first 200 million tokens)`);
  console.log(`${"Matcher ranking".padEnd(30)} ${"0".padStart(10)} ${"0".padStart(9)} ${"0".padStart(6)}  SQL only, no model`);

  const tokens = total.input + total.output;
  console.log(`\nEverything once:              ${n(total.input)} input + ${n(total.output)} output = ${n(tokens)} tokens, ${n(total.calls)} model calls`);
  console.log(`Time at ${REQUESTS_PER_MINUTE} requests a minute:  about ${Math.ceil(total.calls / REQUESTS_PER_MINUTE)} minutes of model calls`);
  console.log(`Per month, all redone weekly: ${n(tokens * WEEKS_PER_MONTH)} tokens, ${n(total.calls * WEEKS_PER_MONTH)} calls`);
  console.log(`Per member per month:         ${n((tokens * WEEKS_PER_MONTH) / members)} tokens, ${n((total.calls * WEEKS_PER_MONTH) / members)} calls, $0  (${members} members)`);
  if (!judging.input) console.log("\nNo judge run has recorded tokens yet: the judge line is 0 until one has.");
  console.log("\nNot in the number: Scout and Copilot (not built), hosting, and the saving from skipping unchanged pages.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeDb);
