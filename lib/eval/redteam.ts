/**
 * The red-team eval (B12): every case of eval/redteam-prompts.json as real
 * Copilot turns for a demo member, each turn checked against what it expects.
 *
 * A case runs as the request does: handleChatTurn (lib/copilot/chat.ts) with
 * the real model, on the member's own database client, so row-level security
 * applies to every tool. Only the HTTP layer is left out. Each case runs in
 * one transaction that is always rolled back, so its chats, saved items,
 * handoffs and the opportunity a case plants (`setup.opportunity`) never
 * reach the database, and nobody else ever sees them:
 *
 *   1. As the owner: store the planted opportunity, if any.
 *   2. Act as the member (role `authenticated` with the member's claims).
 *   3. Each turn in a savepoint, each database step of the turn in one more,
 *      as withUserDb gives each step its own transaction.
 *   4. Roll everything back.
 *
 * The Claude key has a rate limit per minute. A turn that met a 429 (after the
 * SDK's own retries) is rolled back to its savepoint, and sent again after a
 * minute.
 *
 * The summary is RedTeamSummary (lib/trust/shapes.ts) plus the failures, the
 * model and the turn times; a full run also writes eval/redteam-last-run.json.
 */
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { inArray, sql } from "drizzle-orm";
import { handleChatTurn } from "../copilot/chat";
import type { ChatFn } from "../copilot/classifier";
import { getDb } from "../db";
import { companies, opportunities } from "../db/schema";
import type { UserTx } from "../db/user";
import { MODEL_FOR, ModelApiError, modelChat } from "../model";
import type { EvalResult } from "./result";
import {
  checkTurn,
  describeFailure,
  loadRedTeamFile,
  REDTEAM_LAST_RUN_FILE,
  redTeamTable,
  summarise,
  type CaseResult,
  type PlantedOpportunity,
  type RedTeamCase,
  type TurnResult,
} from "./redteam-check";

export type RedTeamOptions = {
  /** Run only this group (its id in the file). */
  group?: string;
  /** Run only this case (its id). */
  case?: string;
};

export type RedTeamSummaryStored = ReturnType<typeof summarise> & {
  passed: number;
  total: number;
  model: { fast: string; main: string };
  failures: { case: string; group: string; problems: string[] }[];
};

export type RedTeamDetails = { cases: CaseResult[] };

/** A 429 sends the turn again after this long, at most MAX_RETRIES times. */
const RATE_LIMIT_WAIT_MS = 60_000;
const MAX_RETRIES = 3;
/** Between turns, so the run leaves room on the shared key. */
const PAUSE_MS = 1_500;

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

class Rollback extends Error {}
class RateLimited extends Error {}

/** Runs `work` in an owner transaction that is always rolled back, and returns what it returned. */
async function rolledBack<T>(work: (tx: UserTx) => Promise<T>): Promise<T> {
  let result!: T;
  try {
    await getDb().transaction(async (tx) => {
      result = await work(tx);
      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
  return result;
}

/** From here on in this transaction, act as a signed-in member of this company (as withUserDb does). */
async function actAs(tx: UserTx, member: { userId: string; companyId: string }) {
  const claims = { sub: member.userId, role: "authenticated", app_metadata: { role: "member", company_id: member.companyId } };
  await tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`);
  await tx.execute(sql`set local role authenticated`);
}

async function plant(tx: UserTx, o: PlantedOpportunity) {
  await tx.insert(opportunities).values({ ...o, retrievedAt: new Date() });
}

/** modelChat that notes each call: which step, how long, and the error. */
function recordingChat() {
  const calls: TurnResult["calls"] = [];
  let rateLimited = false;
  const chat: ChatFn = async (request, options) => {
    const step = request.response_format ? "classifier" : "assistant";
    const started = Date.now();
    try {
      const response = await modelChat(request, options);
      calls.push({ step, ms: Date.now() - started });
      return response;
    } catch (error) {
      if (error instanceof ModelApiError && error.status === 429) rateLimited = true;
      calls.push({ step, ms: Date.now() - started, error: error instanceof ModelApiError ? `HTTP ${error.status}` : error instanceof Error ? error.name : String(error) });
      throw error;
    }
  };
  return { chat, calls, rateLimited: () => rateLimited };
}

async function runCase(group: string, c: RedTeamCase, account: string, companyId: string, log: (line: string) => void): Promise<CaseResult> {
  const member = { userId: randomUUID(), companyId };
  const threadId = randomUUID();
  const turns = await rolledBack(async (tx) => {
    if (c.setup?.opportunity) await plant(tx, c.setup.opportunity);
    await actAs(tx, member);

    const results: TurnResult[] = [];
    for (const turn of c.turns) {
      let retries = 0;
      for (;;) {
        const recorder = recordingChat();
        try {
          const reply = await tx.transaction(async (savepoint) => {
            const answer = await handleChatTurn(
              { ...member, threadId, message: turn.user, startedAt: Date.now() },
              { db: (run) => savepoint.transaction(run), chat: recorder.chat },
            );
            // The classifier falls back to in_scope on a 429, and the assistant answers "busy": neither is the Copilot's own behaviour.
            if (recorder.rateLimited()) throw new RateLimited();
            return answer;
          });
          const checked = { label: reply.label, text: reply.text, citations: reply.citations.length, handoffSent: reply.handoffSent };
          results.push({
            user: turn.user,
            reply: { ...checked, outcome: reply.outcome, seconds: reply.seconds, modelCalls: reply.modelCalls },
            calls: recorder.calls,
            retries,
            problems: checkTurn(turn.expect, checked),
          });
          break;
        } catch (error) {
          if (!(error instanceof RateLimited)) throw error;
          if (retries >= MAX_RETRIES) {
            results.push({
              user: turn.user,
              reply: { label: "in_scope", text: "", citations: 0, handoffSent: false, outcome: "busy", seconds: 0, modelCalls: recorder.calls.length },
              calls: recorder.calls,
              retries,
              problems: [`the Claude key answered 429 (too many requests) ${MAX_RETRIES + 1} times`],
            });
            break;
          }
          retries++;
          log(`  ${c.id}: 429 from the Claude key, sending the turn again in ${RATE_LIMIT_WAIT_MS / 1000} s`);
          await sleep(RATE_LIMIT_WAIT_MS);
        }
      }
      await sleep(PAUSE_MS);
    }
    return results;
  });
  return { id: c.id, group, account, passed: turns.every((t) => !t.problems.length), turns };
}

export async function redTeam(options: RedTeamOptions = {}, log: (line: string) => void = console.log): Promise<EvalResult<RedTeamSummaryStored, RedTeamDetails> & { partial: boolean }> {
  const file = loadRedTeamFile();
  const groupIds = file.groups.map((g) => g.id);
  if (options.group && !groupIds.includes(options.group)) throw new Error(`No group "${options.group}". Groups: ${groupIds.join(", ")}.`);
  const chosen = file.groups
    .filter((g) => !options.group || g.id === options.group)
    .flatMap((g) => g.cases.filter((c) => !options.case || c.id === options.case).map((c) => ({ group: g.id, c })));
  if (!chosen.length) throw new Error(`No case "${options.case}"${options.group ? ` in group ${options.group}` : ""}.`);

  const slugs = [...new Set(chosen.map(({ c }) => c.account ?? file.defaultAccount))];
  const found = await getDb().select({ id: companies.id, slug: companies.slug }).from(companies).where(inArray(companies.slug, slugs));
  const companyIds = new Map(found.map((f) => [f.slug, f.id]));
  const missing = slugs.filter((s) => !companyIds.has(s));
  if (missing.length) throw new Error(`Demo companies not in the database: ${missing.join(", ")}.`);

  const cases: CaseResult[] = [];
  for (const [i, { group, c }] of chosen.entries()) {
    const account = c.account ?? file.defaultAccount;
    let result: CaseResult;
    try {
      result = await runCase(group, c, account, companyIds.get(account)!, log);
    } catch (error) {
      result = { id: c.id, group, account, passed: false, turns: [], error: error instanceof Error ? error.message.slice(0, 300) : String(error) };
    }
    cases.push(result);
    const times = result.turns.map((t) => `${t.reply.seconds} s`).join(", ");
    log(`  [${i + 1}/${chosen.length}] ${result.passed ? "pass" : "FAIL"} ${c.id}${times ? ` (${times})` : ""}`);
    if (!result.passed) for (const line of describeFailure(result)) log(`      ${line}`);
    // A run of one group or case is for looking closely: every answer in full.
    if (options.group || options.case) {
      for (const [n, t] of result.turns.entries()) log(`      turn ${n + 1} -> ${t.reply.label}/${t.reply.outcome}, ${t.reply.citations} citations:\n${t.reply.text.replace(/^/gm, "        | ")}`);
    }
  }

  const groups = summarise(groupIds, cases);
  const summary: RedTeamSummaryStored = {
    ...groups,
    passed: cases.filter((c) => c.passed).length,
    total: cases.length,
    model: { fast: MODEL_FOR.classifier.model, main: MODEL_FOR.copilot.model },
    failures: cases
      .filter((c) => !c.passed)
      .map((c) => ({ case: c.id, group: c.group, problems: c.error ? [`could not run: ${c.error}`] : c.turns.flatMap((t, i) => t.problems.map((p) => `turn ${i + 1}: ${p}`)) })),
  };
  const partial = Boolean(options.group || options.case);
  const result = { kind: "red_team", summary, details: { cases }, partial };
  if (!partial) {
    writeFileSync(path.join(process.cwd(), REDTEAM_LAST_RUN_FILE), `${JSON.stringify({ ranAt: new Date().toISOString(), summary, cases }, null, 2)}\n`);
  }
  return result;
}

export { redTeamTable };
