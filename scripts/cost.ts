/**
 * What the agents use (A24): tokens and US dollars per full run and per
 * member per month, from the real runs.
 *
 *   npm run cost
 *
 * Reads DATABASE_URL from .env.local. Nothing is written.
 *
 * The app runs on Claude: each step's model is MODEL_FOR in lib/model.ts
 * (Haiku 5.5 or Sonnet 5.5), priced at the list prices below. The token
 * counts recorded before 15 Nov 2026 came from NVIDIA's model, whose
 * tokenizer counts differently, so the dollars are an estimate until Claude
 * runs have replaced them. Prompt caching makes the tool loops cheaper than
 * shown.
 *
 * Profiling and judging are summed from job_runs. Tagging, connections, trend
 * notes and embeddings were run as scripts on 2026-11-14 and did not record
 * their tokens there; their numbers are below.
 *
 * The monthly number is a worst case: every week every member is profiled
 * again, everything is tagged and embedded again, every match is judged again,
 * and there is one trend run and one connections run. Unchanged pages skip
 * the model, so real use is lower.
 *
 * Scout and the Copilot run when a member asks, so they are shown per brief
 * and per turn, outside the monthly number. Scout records its tokens in
 * job_runs (jobs "scout-brief" and "scout-script"), the Copilot as job
 * "copilot-turn" (lib/copilot/turn.ts, copilotTurnRun). Until a turn is
 * recorded, only the measured number of model calls is shown.
 */
import { count, inArray, sql } from "drizzle-orm";
import { COPILOT_TURN_JOB } from "../lib/copilot/turn";
import { closeDb, getDb } from "../lib/db";
import { companies, jobRuns } from "../lib/db/schema";
import { MODEL_FOR, MODELS } from "../lib/model";

type Usage = { input: number; output: number; calls: number | null };

/**
 * US dollars per million tokens, Claude API list prices (checked 2026-11-15).
 * Haiku's price is for prompts of 100,000 tokens or fewer, which every step's
 * prompt is.
 */
const PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  [MODELS.haiku]: { input: 0.1, output: 0.5 },
  [MODELS.sonnet]: { input: 2, output: 10 },
};

const dollars = (usage: Pick<Usage, "input" | "output">, model: string) =>
  (usage.input * PRICE_PER_MTOK[model].input + usage.output * PRICE_PER_MTOK[model].output) / 1_000_000;

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

/**
 * Model calls in one in-scope Copilot turn, measured on 2026-11-14: the
 * classifier, then the assistant's tool rounds and answer, plus one call when
 * the output check asks for a revision (lib/copilot/turn.ts). Out-of-scope and
 * unclear turns make one call. Shown only while no turn is recorded in job_runs.
 */
const COPILOT_CALLS_PER_TURN = { min: 3, max: 6 };

const WEEKS_PER_MONTH = 52 / 12;

async function usageOf(jobs: string[]): Promise<Usage & { runs: number; succeeded: number }> {
  const [row] = await getDb()
    .select({
      runs: count(),
      succeeded: sql<number>`count(*) filter (where ${jobRuns.status} = 'succeeded')`.mapWith(Number),
      input: sql<number>`coalesce(sum(${jobRuns.inputTokens}), 0)`.mapWith(Number),
      output: sql<number>`coalesce(sum(${jobRuns.outputTokens}), 0)`.mapWith(Number),
      calls: sql<number>`coalesce(sum((${jobRuns.stats}->>'calls')::int), 0)`.mapWith(Number),
    })
    .from(jobRuns)
    .where(inArray(jobRuns.job, jobs));
  return row;
}

const n = (value: number) => Math.round(value).toLocaleString("en-US");
const usd = (value: number) => `$${value < 0.1 ? value.toFixed(4) : value.toFixed(2)}`;
const short = (model: string) => (model === MODELS.haiku ? "Haiku" : model === MODELS.sonnet ? "Sonnet" : model);

async function main() {
  const [{ members }] = await getDb().select({ members: count() }).from(companies);
  const [profiling, judging, scout, copilot] = await Promise.all([
    usageOf(["profile-company"]),
    usageOf(["judge-script", "judge-company"]),
    usageOf(["scout-brief", "scout-script"]),
    usageOf([COPILOT_TURN_JOB]),
  ]);

  const lines: { job: string; where: string; usage: Usage; model: string }[] = [
    // The profiler makes one call per run, and a second when a quote fails: runs is the floor.
    { job: `Profile ${members} members`, where: `job_runs, sum of ${profiling.runs} runs`, usage: { ...profiling, calls: profiling.runs }, model: MODEL_FOR.profiler.model },
    { job: "Tag opportunities + members", where: "script run", usage: MEASURED_BY_HAND.tagging, model: MODEL_FOR.tagger.model },
    { job: "Judge every match", where: `job_runs, sum of ${judging.runs} runs`, usage: judging, model: MODEL_FOR.judge.model },
    { job: "Connections, one run", where: "script run", usage: MEASURED_BY_HAND.connections, model: MODEL_FOR.connections.model },
    { job: "Trend notes, one week", where: "script run", usage: MEASURED_BY_HAND.trends, model: MODEL_FOR.trends.model },
  ];

  console.log("Model: Claude (lib/model.ts, MODEL_FOR) at list prices. Tokens as the model counted them; before 15 Nov 2026 that was NVIDIA's model.\n");
  const header = (title: string) =>
    console.log(`${title.padEnd(30)} ${"input".padStart(10)} ${"output".padStart(9)} ${"calls".padStart(6)} ${"model".padStart(7)} ${"US$".padStart(8)}  source`);
  header("One full run of");
  const total = { input: 0, output: 0, calls: 0, dollars: 0 };
  for (const l of lines) {
    const cost = dollars(l.usage, l.model);
    total.input += l.usage.input;
    total.output += l.usage.output;
    total.calls += l.usage.calls ?? 0;
    total.dollars += cost;
    console.log(
      `${l.job.padEnd(30)} ${n(l.usage.input).padStart(10)} ${n(l.usage.output).padStart(9)} ${n(l.usage.calls ?? 0).padStart(6)} ${short(l.model).padStart(7)} ${usd(cost).padStart(8)}  ${l.where}`,
    );
  }
  console.log(`${"Embeddings (Voyage)".padEnd(30)} ${n(EMBEDDING_TOKENS).padStart(10)} ${"".padStart(9)} ${"".padStart(6)} ${"".padStart(7)} ${"$0".padStart(8)}  free (first 200 million tokens)`);
  console.log(`${"Matcher ranking".padEnd(30)} ${"0".padStart(10)} ${"0".padStart(9)} ${"0".padStart(6)} ${"".padStart(7)} ${"$0".padStart(8)}  SQL only, no model`);

  const tokens = total.input + total.output;
  console.log(`\nEverything once:              ${n(total.input)} input + ${n(total.output)} output = ${n(tokens)} tokens, ${n(total.calls)} model calls, ${usd(total.dollars)}`);
  console.log(`Per month, all redone weekly: ${n(tokens * WEEKS_PER_MONTH)} tokens, ${n(total.calls * WEEKS_PER_MONTH)} calls, ${usd(total.dollars * WEEKS_PER_MONTH)}`);
  console.log(
    `Per member per month:         ${n((tokens * WEEKS_PER_MONTH) / members)} tokens, ${n((total.calls * WEEKS_PER_MONTH) / members)} calls, ${usd((total.dollars * WEEKS_PER_MONTH) / members)}  (${members} members)`,
  );
  if (!judging.input) console.log("\nNo judge run has recorded tokens yet: the judge line is 0 until one has.");
  console.log("\nThe profile and judge lines add up every recorded run, so a run that is repeated (a re-judge, a second profiling) is counted twice.");

  // Scout and the Copilot run when a member asks, so they are per brief and per turn.
  console.log("");
  header("When a member asks");
  if (scout.runs) {
    const per = { input: scout.input / scout.runs, output: scout.output / scout.runs };
    console.log(
      `${"One Scout brief (average)".padEnd(30)} ${n(per.input).padStart(10)} ${n(per.output).padStart(9)} ${n((scout.calls ?? 0) / scout.runs).padStart(6)} ${short(MODEL_FOR.scout.model).padStart(7)} ${usd(dollars(per, MODEL_FOR.scout.model)).padStart(8)}  job_runs, ${scout.runs} runs (${scout.succeeded} succeeded)`,
    );
  } else {
    console.log(`${"One Scout brief".padEnd(30)} ${"-".padStart(10)} ${"-".padStart(9)} ${"-".padStart(6)} ${"".padStart(7)} ${"-".padStart(8)}  no run recorded in job_runs yet`);
  }
  if (copilot.runs) {
    // Most of a turn's tokens are the assistant's (Sonnet); the classifier's one Haiku call is priced as Sonnet here, a small overcount.
    const per = { input: copilot.input / copilot.runs, output: copilot.output / copilot.runs };
    console.log(
      `${"One Copilot turn (average)".padEnd(30)} ${n(per.input).padStart(10)} ${n(per.output).padStart(9)} ${n((copilot.calls ?? 0) / copilot.runs).padStart(6)} ${short(MODEL_FOR.copilot.model).padStart(7)} ${usd(dollars(per, MODEL_FOR.copilot.model)).padStart(8)}  job_runs, ${copilot.runs} turns (${copilot.succeeded} succeeded)`,
    );
  } else {
    console.log(
      `${"One Copilot turn (in scope)".padEnd(30)} ${"-".padStart(10)} ${"-".padStart(9)} ${`${COPILOT_CALLS_PER_TURN.min}-${COPILOT_CALLS_PER_TURN.max}`.padStart(6)} ${"".padStart(7)} ${"-".padStart(8)}  tokens not recorded yet; calls measured 2026-11-14`,
    );
  }

  console.log("\nNot in the monthly number: Scout briefs and Copilot turns (per question, above), hosting, and the saving from skipping unchanged pages.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeDb);
