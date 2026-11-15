/**
 * Run one Scout brief (B3, B4, B15) from the command line, with the same
 * functions the scout-brief job uses.
 *
 *   tsx --env-file-if-exists=.env.local scripts/scout.ts embeddedart "Which test facilities and funding could fit an underwater sensor we want to trial next year?"
 *   tsx ... scripts/scout.ts techinova "Funding for safer electricity grid technology" --prerun
 *   tsx ... scripts/scout.ts embeddedart "<question>" --dry
 *
 * Stores a `briefs` row for the company (owned by the company's first auth
 * user, or --user <uuid>), prints the progress as it goes and the brief at
 * the end, and records the run in job_runs (job "scout-script").
 *
 * --prerun  marks the row as a pre-run for the demo (B15) and writes it to
 *           data/scout-briefs/<slug>.json, which cached demo mode opens.
 * --dry     stores nothing: no row, no job_runs, no file.
 *
 * A rate limit (429) waits a minute and tries the same call again.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { closeDb, getDb } from "../lib/db";
import { briefs, companies } from "../lib/db/schema";
import { loadCompanies } from "../lib/embeddings/enrich";
import { isRateLimit, RUN_BUDGET_MS, runScout, type ScoutResult, type StepRunner } from "../lib/scout/agent";
import { readPage } from "../lib/scout/read-page";
import { realLinkCheck, realSearch, runScoutBrief } from "../lib/scout/run";
import { maxSearches } from "../lib/scout/search";
import { webProviderFromEnv } from "../lib/scout/web-search";
import { createBrief, recordRun } from "../lib/scout/store";
import type { PrerunFile } from "../lib/scout/prerun";
import { StoredBriefJson, type ProgressStep, type ScoutBrief } from "../lib/scout/types";
import { isCachedMode } from "../lib/collectors/cache";

const RATE_LIMIT_WAIT_MS = 60_000;
const MAX_RATE_LIMIT_WAITS = 3;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function parseArgs(args: string[]) {
  const userAt = args.indexOf("--user");
  const user = userAt >= 0 ? args[userAt + 1] : undefined;
  const positional = args.filter((arg, i) => !arg.startsWith("--") && (userAt < 0 || i !== userAt + 1));
  const [slug, ...rest] = positional;
  return { slug, question: rest.join(" ").trim(), dry: args.includes("--dry"), prerun: args.includes("--prerun"), user };
}

let rateLimitWaits = 0;

/** Runs the work; on a 429, waits a minute and runs it again. */
const runWithBackoff: StepRunner = async (name, work) => {
  for (let waits = 0; ; waits++) {
    try {
      return await work();
    } catch (error) {
      if (!isRateLimit(error) || waits >= MAX_RATE_LIMIT_WAITS) throw error;
      rateLimitWaits++;
      console.log(`  [${name}] rate limited; trying again in ${RATE_LIMIT_WAIT_MS / 1000} s`);
      await sleep(RATE_LIMIT_WAIT_MS);
    }
  }
};

const started = Date.now();
const clock = () => `${String(Math.round((Date.now() - started) / 1000)).padStart(3)} s`;
const printLines = (lines: ProgressStep[]) => {
  for (const line of lines) console.log(`${clock()}  [${line.kind}] ${line.text}`);
};

/** The company's member account: the first auth user whose app_metadata names the company. */
async function companyUser(companyId: string): Promise<string | null> {
  const rows = await getDb().execute<{ id: string }>(
    sql`select id from auth.users where raw_app_meta_data ->> 'company_id' = ${companyId} order by created_at limit 1`,
  );
  return rows[0]?.id ?? null;
}

function printBrief(brief: ScoutBrief) {
  console.log(`\nSummary: ${brief.summary}`);
  for (const note of brief.notes) console.log(`Note: ${note}`);
  brief.options.forEach((o, i) => {
    console.log(`\n${i + 1}. ${o.title}  [${o.kind}${o.deadline ? `, ${o.deadline.slice(0, 10)}` : ""}]`);
    const live = o.citation.liveRetrievedAt ? `, ${o.citation.liveSource} at ${o.citation.liveRetrievedAt}` : "";
    console.log(`   source:   ${o.citation.url}  (retrieved ${o.citation.retrievedAt}, ${o.citation.origin}${live}${o.citation.pageRead ? ", page read" : ""}; ${o.citation.sourceName ?? ""})`);
    if (o.citation.injection) console.log(`   label:    ${o.citation.injection}`);
    console.log(`   from you: ${o.whyProfile}`);
    console.log(`   offers:   ${o.whySource}`);
    console.log(`   requires: ${o.requirements.join(" | ")}`);
    console.log(`   contact:  ${o.contactRoute}`);
    console.log(`   open:     ${o.openQuestions.join(" | ")}`);
  });
}

function printRun(result: ScoutResult) {
  console.log(
    `\nloop ended: ${result.loopEnd}; ${result.searches} searches, ${result.pagesRead} pages read; live/web: ${result.webSearch}${result.webProblem ? ` (${result.webProblem})` : ""}`,
  );
  console.log(`answered live: ${result.liveAnswered.map((a) => `${a.name} at ${a.at}`).join("; ") || "nothing"}`);
  if (result.brief) {
    const byOrigin = (origin: string) => result.brief!.options.filter((o) => o.citation.origin === origin).length;
    console.log(`options by origin: store ${byOrigin("store")}, live (not in the store) ${byOrigin("live")}, web ${byOrigin("web")}`);
  }
  for (const w of result.writes) {
    console.log(`writer attempt ${w.attempt}: ${w.accepted}/${w.given} options passed${w.problems.length ? `\n   ${w.problems.join("\n   ")}` : ""}`);
  }
  console.log(`model calls: ${result.usage.calls}, tokens ${result.usage.inputTokens} in / ${result.usage.outputTokens} out; rate-limit waits: ${rateLimitWaits}`);
}

async function main() {
  const { slug, question, dry, prerun, user } = parseArgs(process.argv.slice(2));
  if (!slug || question.length < 10) {
    console.error('Usage: tsx --env-file-if-exists=.env.local scripts/scout.ts <company-slug> "<question>" [--prerun] [--dry] [--user <uuid>]');
    process.exitCode = 1;
    return;
  }
  const db = getDb();
  const [company] = await db.select({ id: companies.id, slug: companies.slug, name: companies.name }).from(companies).where(eq(companies.slug, slug));
  if (!company) throw new Error(`No company with slug "${slug}".`);
  console.log(
    `${company.name}: "${question}"${dry ? " (dry run: nothing is stored)" : ""}${prerun ? " (pre-run)" : ""}; up to ${maxSearches()} searches; cached mode ${isCachedMode() ? "on" : "off"}; web provider ${webProviderFromEnv()?.name ?? "none (no key)"}`,
  );

  if (dry) {
    const [texts] = await loadCompanies([company.id]);
    let shown = 0;
    const printNew = (progress: ProgressStep[]) => {
      printLines(progress.slice(shown));
      shown = progress.length;
    };
    const result = await runScout(
      { question, company, profileText: texts?.personalText ?? company.name, startedAt: Date.now() },
      {
        run: runWithBackoff,
        ...realSearch(company.id),
        readPage: (url) => readPage(url),
        checkLinks: realLinkCheck(),
        saveProgress: async (progress) => printNew(progress),
        saveDone: async (_brief, progress) => printNew(progress),
        saveFailed: async (_error, progress) => printNew(progress),
      },
    );
    if (result.brief) printBrief(result.brief);
    else console.log(`\nFAILED: ${result.error}`);
    printRun(result);
    console.log(`\ntotal ${clock().trim()}`);
    return;
  }

  const userId = user ?? (await companyUser(company.id));
  if (!userId) throw new Error(`No auth user has company ${company.slug}; run npm run db:demo-users or pass --user <uuid>.`);
  const row = await createBrief({ companyId: company.id, userId, question, prerun });
  console.log(`brief ${row.id}`);

  const runStarted = new Date();
  const outcome = await runScoutBrief(row.id, { run: runWithBackoff, onProgress: printLines });
  if (outcome.skipped) throw new Error(`The brief was already ${outcome.status}.`);
  if (outcome.brief) printBrief(outcome.brief);
  else console.log(`\nFAILED: ${outcome.error}`);
  printRun(outcome);
  const seconds = Math.round((Date.now() - outcome.startedAt) / 1000);
  console.log(`\nrun time ${seconds} s (budget ${RUN_BUDGET_MS / 1000} s); total with setup ${clock().trim()}`);

  await recordRun({
    job: "scout-script",
    trigger: "script",
    ok: outcome.brief !== null,
    startedAt: runStarted,
    inputTokens: outcome.usage.inputTokens,
    outputTokens: outcome.usage.outputTokens,
    stats: {
      company: company.slug,
      briefId: row.id,
      prerun,
      seconds,
      calls: outcome.usage.calls,
      searches: outcome.searches,
      pagesRead: outcome.pagesRead,
      options: outcome.brief?.options.length ?? 0,
      loopEnd: outcome.loopEnd,
      writes: outcome.writes.map((w) => ({ attempt: w.attempt, given: w.given, accepted: w.accepted })),
      webSearch: outcome.webSearch,
      webProblem: outcome.webProblem,
      liveAnswered: outcome.liveAnswered.map((a) => a.name),
      liveOptions: outcome.brief?.options.filter((o) => o.citation.origin === "live").length ?? 0,
      rateLimitWaits,
    },
    error: outcome.error,
  });

  if (prerun && outcome.brief) {
    const [stored] = await db
      .select({ question: briefs.question, createdAt: briefs.createdAt, completedAt: briefs.completedAt, searchCount: briefs.searchCount, brief: briefs.brief })
      .from(briefs)
      .where(eq(briefs.id, row.id));
    const file: PrerunFile = {
      slug: company.slug,
      companyName: company.name,
      question: stored.question,
      createdAt: stored.createdAt.toISOString(),
      completedAt: stored.completedAt?.toISOString() ?? null,
      searchCount: stored.searchCount,
      brief: StoredBriefJson.parse(stored.brief),
    };
    const dir = path.join(process.cwd(), "data", "scout-briefs");
    await mkdir(dir, { recursive: true });
    const target = path.join(dir, `${company.slug}.json`);
    await writeFile(target, `${JSON.stringify(file, null, 2)}\n`);
    console.log(`wrote ${path.relative(process.cwd(), target)}`);
  }
  if (!outcome.brief) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeDb);
