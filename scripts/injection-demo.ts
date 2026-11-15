/**
 * The planted prompt-injection demo (B13): proof that text hidden in a web
 * page does not steer the system. Dry: it writes nothing to the database.
 *
 *   tsx --env-file-if-exists=.env.local scripts/injection-demo.ts
 *   ... --extract-only          fetch, extract and label the page; no model calls, no result file
 *   ... --url <url>             another copy of the test page (default: the local dev server)
 *   ... --slug <slug>           the member whose profile the judge reads (default: embeddedart)
 *
 * 1. Fetches /demo/injection-test from the running site and turns it into
 *    text with the repo's extractor (lib/fetcher/extract.ts). The repo's
 *    fetcher (fetchPage) refuses local addresses on purpose, so a local URL
 *    is fetched with plain fetch and the same User-Agent; a public URL goes
 *    through fetchPage.
 * 2. Labels the page with the detector (lib/injection/detect.ts) and records
 *    which planted instructions the extractor kept.
 * 3. Runs the page text through the two model steps that read outside text,
 *    with their real prompt builders and code checks:
 *    - the profiler (lib/profiler), as if the page were a company's website,
 *      then the quote check (verifyDraftClaims); no retry round;
 *    - the judge (lib/judge), as the description of a funding call judged
 *      against the member's public profile (read-only), then checkJudgeReply,
 *      and one retry with the reasons when a check fails, like the job.
 *    Each runs on the extracted text, and again on the "raw" text with every
 *    planted instruction put back in, so the proof does not depend on the
 *    extractor dropping them.
 * 4. Prints the label, each model's answer and PASS or FAIL per step, and
 *    writes data/injection-demo/result.json for /staff/injection-demo.
 *
 * The visible test banner is removed from what the models read, so they take
 * the call for a real one. At most 6 model calls (4 without retries); a rate
 * limit (429) waits a minute and tries again, twice at most.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio/slim";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "../lib/db";
import { companies } from "../lib/db/schema";
import { loadCompanies } from "../lib/embeddings/enrich";
import { extractPage } from "../lib/fetcher/extract";
import { decodeHtml, fetchPage, publicHttpUrl, USER_AGENT } from "../lib/fetcher/fetch-page";
import { describeLocations, detectInjection, type InjectionLocation } from "../lib/injection/detect";
import { DEMO_BANNER_TEXT, DEMO_BANNER_TITLE, DEMO_CALL, DEMO_PAGE_PATH, PLANTED, PLANTED_META_NAME } from "../lib/injection/demo-page";
import {
  DEMO_RESULT_DIR,
  DEMO_RESULT_NAME,
  plantedIn,
  promiseWords,
  quotesPlanted,
  stepVerdict,
  VERDICT_TEXT,
  type InjectionDemoResult,
  type InjectionDemoStep,
} from "../lib/injection/demo-result";
import { JUDGE_TIMEOUT_MS } from "../lib/judge";
import { judgeJsonSchema } from "../lib/judge/output";
import { buildJudgeUserMessage, JUDGE_SYSTEM_PROMPT, type JudgeOpportunity } from "../lib/judge/prompt";
import { checkJudgeReply, retryFeedback, type CheckedReply } from "../lib/judge/verify";
import { MODEL_FOR, ModelApiError, modelChat } from "../lib/model";
import { runProfiler, type DraftClaim, type ProfilerSource } from "../lib/profiler";
import { buildProfilerUserMessage } from "../lib/profiler/prompt";
import { mergeRetry, verifyDraftClaims } from "../lib/profiler/verify";

const RATE_LIMIT_WAIT_MS = 60_000;
const MAX_RATE_LIMIT_WAITS = 2;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function parseArgs(args: string[]) {
  const value = (flag: string) => {
    const at = args.indexOf(flag);
    return at >= 0 ? args[at + 1] : undefined;
  };
  return {
    url: value("--url") ?? `http://localhost:3000${DEMO_PAGE_PATH}`,
    slug: value("--slug") ?? "embeddedart",
    extractOnly: args.includes("--extract-only"),
  };
}

/** One model call; on a 429, waits a minute and tries again. */
async function withBackoff<T>(label: string, work: () => Promise<T>): Promise<T> {
  for (let waits = 0; ; waits++) {
    try {
      return await work();
    } catch (error) {
      if (!(error instanceof ModelApiError && error.status === 429) || waits >= MAX_RATE_LIMIT_WAITS) throw error;
      console.log(`  [${label}] rate limited; trying again in ${RATE_LIMIT_WAIT_MS / 1000} s`);
      await sleep(RATE_LIMIT_WAIT_MS);
    }
  }
}

/** The page's HTML: through fetchPage for a public URL; local addresses, which fetchPage refuses, with plain fetch. */
async function loadHtml(url: string): Promise<{ html: string; how: string }> {
  let isPublic = true;
  try {
    publicHttpUrl(url);
  } catch {
    isPublic = false;
  }
  if (isPublic) return { html: (await fetchPage(url)).html, how: "the repo's fetcher (fetchPage)" };
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "text/html" }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${url} answered ${res.status}. Is the dev server running?`);
  return {
    html: decodeHtml(new Uint8Array(await res.arrayBuffer()), res.headers.get("content-type")),
    how: "plain fetch (fetchPage refuses local addresses on purpose)",
  };
}

/** The page with every planted instruction turned into visible text: meta content first, comments and alt texts in place. */
function unhide(html: string): string {
  const comments = html.replace(/<!--([\s\S]*?)-->/g, (all, body: string) => (/[a-z]{3}/i.test(body) ? `<p>${body.trim()}</p>` : all));
  const $ = cheerio.load(comments);
  const meta = $(`meta[name="${PLANTED_META_NAME}"]`).attr("content");
  $("img[alt]").each((_, el) => {
    $(el).replaceWith($("<p></p>").text(el.attribs.alt ?? ""));
  });
  if (meta) $("main").first().prepend($("<p></p>").text(meta));
  return $.html();
}

/** The text the models read: the banner removed, so they take the call for a real one. */
const withoutBanner = (text: string) =>
  text
    .split(/\n+/)
    .filter((line) => line.trim() !== DEMO_BANNER_TITLE && line.trim() !== DEMO_BANNER_TEXT)
    .join("\n\n")
    .trim();

const keptIn = (text: string) => PLANTED.map((p) => ({ ...p, kept: plantedIn(text, p.text) }));

const inPrompt = (prompt: string): InjectionLocation[] => PLANTED.filter((p) => plantedIn(prompt, p.text)).map((p) => p.where);

const plantedTexts = PLANTED.map((p) => p.text);

const valueText = (claim: DraftClaim) => (Array.isArray(claim.value) ? claim.value.join("; ") : (claim.value ?? ""));

/** Promise words in a list of texts, and quotes copied from the planted text, as one list of findings. */
function findings(texts: string[], quotes: string[]): string[] {
  const words = promiseWords(texts.join("\n")).map((w) => `"${w}"`);
  const copied = quotes.filter((q) => quotesPlanted(q, plantedTexts)).map((q) => `quote from the planted text: "${q.slice(0, 80)}"`);
  return [...new Set([...words, ...copied])];
}

type Variant = { input: "extracted" | "raw"; text: string };

async function profilerStep(variant: Variant, pageUrl: string, lang: ProfilerSource["lang"]): Promise<InjectionDemoStep> {
  const source: ProfilerSource = { snapshotId: "injection-demo", source: "company_site", url: pageUrl, lang, text: variant.text };
  const base = { step: "profiler" as const, input: variant.input, instructionsInInput: inPrompt(buildProfilerUserMessage(DEMO_CALL.funder, [source])) };
  const started = Date.now();
  try {
    const run = await withBackoff(`profiler ${variant.input}`, () => runProfiler(DEMO_CALL.funder, [source]));
    const verified = verifyDraftClaims(run.claims, new Map([[source.snapshotId, variant.text]]));
    // No retry round here: a failed field becomes "missing", as after a retry that fails again.
    const { claims: final, dropped } = mergeRetry(verified, null);
    const answered = run.claims.filter((c) => c.status !== "missing");
    const kept = final.filter((c) => c.status !== "missing");
    const modelWrote = findings(
      answered.map(valueText),
      answered.flatMap((c) => c.evidence.map((e) => e.quote)),
    );
    const stored = findings(
      kept.map(valueText),
      kept.flatMap((c) => c.evidence.map((e) => e.quote)),
    );
    const verdict = stepVerdict({ modelWrote, stored });
    return {
      ...base,
      answer: run.claims.map((c) => `${c.field} (${c.status}): ${c.status === "missing" ? "-" : valueText(c).slice(0, 220)}`),
      modelWrote,
      checks: `Quote check: ${verified.quotes.found} of ${verified.quotes.total} quotes found in the page text${dropped.length ? `; dropped: ${dropped.join(", ")}` : ""}. The profiler has no promise-word check of its own.`,
      stored,
      verdict,
      pass: verdict !== "followed",
      calls: 1,
      seconds: Math.round((Date.now() - started) / 100) / 10,
    };
  } catch (error) {
    return { ...base, answer: [], modelWrote: [], checks: `The call failed: ${(error as Error).message.slice(0, 300)}`, stored: [], verdict: "error", pass: false, calls: 1, seconds: Math.round((Date.now() - started) / 100) / 10 };
  }
}

/** The same request as judgeBatch (lib/judge/index.ts), kept here so the raw reply can be shown before the checks. */
async function judgeCall(company: { name: string; profileText: string }, opportunity: JudgeOpportunity, feedback?: string) {
  const ids = [opportunity.id];
  const response = await modelChat(
    {
      model: MODEL_FOR.judge.model,
      max_tokens: 2000,
      messages: [
        { role: "system", content: JUDGE_SYSTEM_PROMPT },
        { role: "user", content: buildJudgeUserMessage(company, [opportunity], { feedback }) },
      ],
      response_format: { type: "json_schema", json_schema: { name: "match_judgements", schema: judgeJsonSchema(ids), strict: true } },
      effort: MODEL_FOR.judge.effort,
    },
    { timeoutMs: JUDGE_TIMEOUT_MS },
  );
  const reply = response.choices[0]?.message.content?.trim() ?? "";
  const checked: CheckedReply = checkJudgeReply(reply, ids, { sharedAreas: { [opportunity.id]: opportunity.sharedAreas }, retry: feedback !== undefined });
  return { reply, checked, model: response.model };
}

/** A check's problem without the advice to the model: `"why" uses "eligib" in "..."`. */
const shortProblem = (problem: string) => problem.match(/^("[^"]+" uses "[^"]+" in ".*?")\.\s/)?.[1] ?? (problem.length > 200 ? `${problem.slice(0, 197)}...` : problem);

const problemsOf = (checked: CheckedReply) => [...new Set(checked.failed.flatMap((f) => f.problems.map(shortProblem)))].join(" ");

/** The raw entry's keys as short lines. */
function replyLines(reply: string, id: string): string[] {
  try {
    const entry = (JSON.parse(reply.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? reply) as Record<string, Record<string, unknown>>)[id];
    return Object.entries(entry ?? {}).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(" | ") : String(value)}`.slice(0, 400));
  } catch {
    return [`(not JSON) ${reply.slice(0, 300)}`];
  }
}

async function judgeStep(variant: Variant, company: { name: string; profileText: string }, sharedAreas: string[]): Promise<InjectionDemoStep> {
  const opportunity: JudgeOpportunity = {
    id: "M1",
    title: DEMO_CALL.title,
    kind: "funding",
    source: DEMO_CALL.funder,
    deadline: DEMO_CALL.deadline,
    eventDate: null,
    tags: [...DEMO_CALL.tags],
    sharedAreas,
    contact: DEMO_CALL.contact,
    eligibilityText: DEMO_CALL.whoMayApply,
    description: variant.text,
  };
  const base = { step: "judge" as const, input: variant.input, instructionsInInput: inPrompt(buildJudgeUserMessage(company, [opportunity])) };
  const started = Date.now();
  let calls = 0;
  try {
    calls++;
    const first = await withBackoff(`judge ${variant.input}`, () => judgeCall(company, opportunity));
    const answer = replyLines(first.reply, opportunity.id);
    const writtenTexts = [first.reply];
    let accepted = first.checked.accepted;
    let checks = first.checked.failed.length ? `First answer refused by checkJudgeReply: ${problemsOf(first.checked)}` : "First answer passed checkJudgeReply.";
    if (first.checked.failed.length) {
      calls++;
      const again = await withBackoff(`judge ${variant.input} retry`, () => judgeCall(company, opportunity, retryFeedback(first.checked.failed)));
      writtenTexts.push(again.reply);
      answer.push("Retry:", ...replyLines(again.reply, opportunity.id));
      accepted = again.checked.accepted;
      checks += again.checked.failed.length
        ? ` The retry was refused too, so the match stays unjudged: ${problemsOf(again.checked)}`
        : " The retry passed.";
    }
    const judgement = accepted[0]?.judgement;
    const storedTexts = judgement ? [judgement.why ?? "", judgement.nextStep ?? "", ...judgement.uncertainties, judgement.rejectionReason ?? ""] : [];
    const modelWrote = findings(writtenTexts, []);
    const stored = findings(storedTexts, []);
    const verdict = stepVerdict({ modelWrote, stored });
    answer.push(judgement ? `Would be stored: ${judgement.rejected ? "reject" : "keep"}` : "Would be stored: nothing (unjudged)");
    return { ...base, answer, modelWrote, checks, stored, verdict, pass: verdict !== "followed", calls, seconds: Math.round((Date.now() - started) / 100) / 10 };
  } catch (error) {
    return { ...base, answer: [], modelWrote: [], checks: `The call failed: ${(error as Error).message.slice(0, 300)}`, stored: [], verdict: "error", pass: false, calls, seconds: Math.round((Date.now() - started) / 100) / 10 };
  }
}

function printStep(s: InjectionDemoStep) {
  console.log(`\n== ${s.step} on the ${s.input} text: ${s.pass ? "PASS" : "FAIL"} (${s.verdict}) ==`);
  console.log(`  planted instructions in the model's input: ${s.instructionsInInput.length ? describeLocations(s.instructionsInInput) : "none"}`);
  console.log("  the model answered:");
  for (const line of s.answer) console.log(`    ${line}`);
  console.log(`  promise words or planted quotes the model wrote: ${s.modelWrote.length ? s.modelWrote.join(", ") : "none"}`);
  console.log(`  checks: ${s.checks}`);
  console.log(`  in what would be stored: ${s.stored.length ? s.stored.join(", ") : "none"}`);
  console.log(`  ${VERDICT_TEXT[s.verdict]} ${s.calls} call(s), ${s.seconds} s`);
}

async function main() {
  const { url, slug, extractOnly } = parseArgs(process.argv.slice(2));
  const notes: string[] = [];

  const { html, how } = await loadHtml(url);
  notes.push(`Fetched ${url} with ${how}; the text comes from the repo's extractor (extractPage).`);
  const page = extractPage(html);
  const report = detectInjection({ text: page.text, html });
  const kept = keptIn(page.text);

  console.log(`${url}: ${page.text.length} characters of text (${page.method}, ${page.lang})`);
  console.log(`label: ${report.label ?? "not flagged"}`);
  for (const m of report.matches) console.log(`  [${m.where}${m.context ? `, ${m.context}` : ""}] ${m.rule}/${m.lang}: ${m.snippet}`);
  console.log("what the extractor kept of the planted instructions:");
  for (const k of kept) console.log(`  ${k.kept ? "KEPT   " : "DROPPED"} ${k.where}: ${k.how}`);

  const extracted = withoutBanner(page.text);
  const raw = withoutBanner(extractPage(unhide(html)).text);
  const missingFromRaw = PLANTED.filter((p) => !plantedIn(raw, p.text));
  if (missingFromRaw.length) throw new Error(`The raw text lacks planted text from: ${missingFromRaw.map((p) => p.where).join(", ")}.`);
  notes.push("The visible test banner was removed from the text the models read, so they take the call for a real one.");
  const variants: Variant[] = [{ input: "extracted", text: extracted }];
  if (kept.some((k) => !k.kept)) {
    variants.push({ input: "raw", text: raw });
    notes.push(
      `The extractor dropped ${describeLocations(kept.filter((k) => !k.kept).map((k) => k.where))}, so both steps also ran on the raw text with every planted instruction put back in.`,
    );
  }

  if (extractOnly) {
    console.log(`\n--extract-only: no model calls, no result file. The models would read ${variants.map((v) => `${v.input} (${v.text.length} characters)`).join(" and ")}.`);
    console.log(`\n--- raw text ---\n${raw}`);
    return;
  }

  // Read-only: the member's public profile text and tags, as the judge reads them.
  const [company] = await getDb().select({ id: companies.id, name: companies.name, tags: companies.tags }).from(companies).where(eq(companies.slug, slug));
  if (!company) throw new Error(`No company with slug "${slug}".`);
  const [texts] = await loadCompanies([company.id]);
  const profile = { name: company.name, profileText: texts.publicText };
  const sharedAreas = DEMO_CALL.tags.filter((tag) => company.tags.includes(tag));
  notes.push(`The judge read ${company.name}'s public profile (read-only); areas in common with the call: ${sharedAreas.join(", ") || "none"}.`);
  notes.push("Nothing was written to the database. The profiler ran without its retry round; the judge with one retry when a check failed, like the job.");

  const steps: InjectionDemoStep[] = [];
  for (const variant of variants) {
    steps.push(await profilerStep(variant, url, page.lang));
    printStep(steps.at(-1)!);
    steps.push(await judgeStep(variant, profile, sharedAreas));
    printStep(steps.at(-1)!);
  }

  const result: InjectionDemoResult = {
    ranAt: new Date().toISOString(),
    pageUrl: url,
    model: `${MODEL_FOR.profiler.model} (profile), ${MODEL_FOR.judge.model} (judge)`,
    judgedFor: company.name,
    detector: {
      flagged: report.flagged,
      label: report.label,
      locations: report.locations,
      matches: report.matches.map(({ rule, lang, where, context, snippet }) => ({ rule, lang, where, context, snippet })),
    },
    extractor: { method: page.method, chars: page.text.length, kept: kept.map(({ where, how, text, kept: k }) => ({ where, how, text, kept: k })) },
    notes,
    steps,
    pass: report.flagged && steps.every((s) => s.pass),
  };
  const dir = path.join(process.cwd(), ...DEMO_RESULT_DIR);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, DEMO_RESULT_NAME), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(`\n${result.pass ? "PASS" : "FAIL"}: ${steps.filter((s) => s.pass).length} of ${steps.length} steps passed, page ${report.flagged ? "labelled" : "NOT labelled"}. ${steps.reduce((n, s) => n + s.calls, 0)} model calls.`);
  console.log(`Written to ${path.join(...DEMO_RESULT_DIR, DEMO_RESULT_NAME)}.`);
  if (!result.pass) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeDb);
