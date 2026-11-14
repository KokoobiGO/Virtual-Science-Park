/**
 * Judge the ranked matches (A16) from the command line, with the same
 * functions the judge-company job uses, two companies at a time.
 *
 *   tsx scripts/judge.ts embeddedart --dry      judge and print; store nothing
 *   tsx scripts/judge.ts embeddedart techinova  judge and store these companies
 *   tsx scripts/judge.ts                        every company with unjudged ranked rows
 *   tsx scripts/judge.ts --limit 5              the first 5 of those (by slug)
 *   tsx scripts/judge.ts malvacom --force       judge every ranked row again
 *
 * Reads DATABASE_URL and NVIDIA_API_KEY from .env.local (run it with
 * --env-file-if-exists=.env.local). A stored run is recorded in job_runs
 * (job "judge-script") with the token totals. A rate limit (429) waits a
 * minute and tries the same call again.
 */
import { closeDb, getDb } from "../lib/db";
import { jobRuns } from "../lib/db/schema";
import { emptyJudgeUsage } from "../lib/judge";
import { isRateLimit, judgeCompany, type JudgeCompanyResult, type JudgedLine, type StepRunner } from "../lib/judge/company";
import { companiesToJudge, judgeCoverage } from "../lib/judge/store";

/** Companies judged at once. Each runs its calls one after another. */
const WORKERS = 2;
const RATE_LIMIT_WAIT_MS = 60_000;
const MAX_RATE_LIMIT_WAITS = 10;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function parseArgs(args: string[]) {
  const limitAt = args.indexOf("--limit");
  let limit: number | undefined;
  if (limitAt >= 0) {
    limit = Number(args[limitAt + 1]);
    if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit needs a positive whole number.");
  }
  const slugs = args.filter((arg, i) => !arg.startsWith("--") && (limitAt < 0 || i !== limitAt + 1));
  return { dry: args.includes("--dry"), force: args.includes("--force"), limit, slugs };
}

const rateLimits = { waits: 0, messages: [] as string[] };

/** Runs the work; on a 429, waits a minute and runs it again. */
const runWithBackoff: StepRunner = async (name, work) => {
  for (let waits = 0; ; waits++) {
    try {
      return await work();
    } catch (error) {
      if (!isRateLimit(error) || waits >= MAX_RATE_LIMIT_WAITS) throw error;
      rateLimits.waits++;
      if (rateLimits.messages.length < 5) rateLimits.messages.push((error as Error).message.slice(0, 200));
      console.log(`  [${name}] rate limited (${(error as Error).message.slice(0, 120)}); trying again in ${RATE_LIMIT_WAIT_MS / 1000} s`);
      await sleep(RATE_LIMIT_WAIT_MS);
    }
  }
};

function printLine(l: JudgedLine) {
  const head = `  ${l.mode.padEnd(8)} #${String(l.rank).padStart(2)} r${l.round} ${l.verdict.toUpperCase()}${l.copied ? " (copied)" : ""}  [${l.kind}, ${l.source}] ${l.title.slice(0, 100)}`;
  console.log(head);
  if (l.verdict === "keep") {
    console.log(`      why:  ${l.why}`);
    console.log(`      next: ${l.nextStep}`);
    console.log(`      open: ${l.uncertainties.join(" | ")}`);
  } else if (l.verdict === "reject") {
    console.log(`      reason: ${l.rejectionReason}`);
  } else {
    console.log(`      problems: ${l.problems.join(" | ")}`);
  }
}

function summary(r: JudgeCompanyResult) {
  return `${r.slug.padEnd(28)} judged ${String(r.judged).padStart(2)}, copied ${String(r.copied).padStart(2)}, kept ${String(r.kept).padStart(2)}, rejected ${r.rejected}, unjudged ${r.failed}, rounds ${r.rounds}, retries ${r.retries}, ${r.usage.calls} calls, ${r.usage.inputTokens}/${r.usage.outputTokens} tokens, model ${r.modelSeconds} s${r.privateData ? " (private data: personal judged apart)" : ""}`;
}

async function main() {
  const { dry, force, limit, slugs } = parseArgs(process.argv.slice(2));
  let targets = await companiesToJudge({ slugs, force });
  const idle = slugs.filter((slug) => !targets.some((t) => t.slug === slug));
  if (idle.length) console.log(`nothing to judge for: ${idle.join(", ")} (no unjudged ranked rows; use --force to judge again)`);
  if (limit) targets = targets.slice(0, limit);
  console.log(`${targets.length} companies, ${targets.reduce((sum, t) => sum + t.pending, 0)} ranked rows to judge${dry ? " (dry run: nothing is stored)" : ""}${force ? " (force)" : ""}`);

  const started = new Date();
  const results: JudgeCompanyResult[] = [];
  const failures: { slug: string; error: string }[] = [];
  const queue = [...targets];
  await Promise.all(
    Array.from({ length: Math.min(WORKERS, queue.length) }, async () => {
      for (let company = queue.shift(); company; company = queue.shift()) {
        try {
          const result = await judgeCompany(company.slug, { force, dry, run: runWithBackoff });
          results.push(result);
          console.log(summary(result));
          for (const line of result.lines) if (dry || line.verdict !== "keep") printLine(line);
          if (dry) for (const r of result.retryReasons) console.log(`  retry ${r.batch}:\n    ${r.problems.join("\n    ")}`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          failures.push({ slug: company.slug, error: message });
          console.log(`${company.slug.padEnd(28)} FAILED: ${message.slice(0, 300)}`);
        }
      }
    }),
  );

  const total = { judged: 0, copied: 0, kept: 0, rejected: 0, failed: 0, retries: 0, usage: emptyJudgeUsage() };
  for (const r of results) {
    for (const key of ["judged", "copied", "kept", "rejected", "failed", "retries"] as const) total[key] += r[key];
    total.usage.calls += r.usage.calls;
    total.usage.inputTokens += r.usage.inputTokens;
    total.usage.outputTokens += r.usage.outputTokens;
  }
  const minutes = ((Date.now() - started.getTime()) / 60_000).toFixed(1);
  console.log(
    `\n${results.length} companies in ${minutes} min: ${total.judged} judged by the model, ${total.copied} copied, ${total.kept} kept, ${total.rejected} rejected, ${total.failed} left unjudged; ${total.retries} retries; ${total.usage.calls} calls, ${total.usage.inputTokens} input / ${total.usage.outputTokens} output tokens; ${rateLimits.waits} rate-limit waits; ${failures.length} companies failed`,
  );

  if (!dry && results.length) {
    await getDb()
      .insert(jobRuns)
      .values({
        job: "judge-script",
        trigger: "script",
        status: failures.length ? "failed" : "succeeded",
        startedAt: started,
        finishedAt: new Date(),
        inputTokens: total.usage.inputTokens,
        outputTokens: total.usage.outputTokens,
        stats: {
          force,
          slugs,
          companies: results.length,
          judged: total.judged,
          copied: total.copied,
          kept: total.kept,
          rejected: total.rejected,
          unjudged: total.failed,
          retries: total.retries,
          calls: total.usage.calls,
          rateLimits,
          failures,
          perCompany: results.map((r) => ({ slug: r.slug, judged: r.judged, copied: r.copied, rejected: r.rejected, unjudged: r.failed, rounds: r.rounds })),
        },
        error: failures.length ? `${failures.length} companies failed` : null,
      });
    console.log("\nranked rows now:");
    for (const c of await judgeCoverage()) {
      console.log(`  ${c.mode.padEnd(8)} ${c.ranked} ranked: ${c.judged} judged (${c.kept} kept, ${c.rejected} rejected), ${c.unjudged} unjudged`);
    }
  }
  if (failures.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeDb);
