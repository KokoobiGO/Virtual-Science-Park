/**
 * The assistant (B7): MODEL_FOR.copilot (Sonnet 5.5) with the Copilot's tools,
 * in our own loop, so the deadline and the output check stay ours. At most MAX_TOOL_ROUNDS rounds of
 * tool calls; after that the model must answer with what it has. Every call
 * gets a timeout that ends before the turn's deadline, because Netlify cuts a
 * request off at 30 s.
 */
import { MODEL_FOR, modelChat, type ChatMessage, type ToolCall } from "../model";
import type { ChatFn, HistoryTurn } from "./classifier";
import { ASSISTANT_HISTORY_TURNS, historyMessage, toolResultBlock } from "./prompt";
import type { Citation } from "./sources";
import { TOOL_DEFINITIONS, TOOL_STATUS, type ToolExecutor, type ToolName, type ToolOutcome } from "./tools";

export const MAX_TOOL_ROUNDS = 3;
/** Tool calls the model may make in one round; more are answered with an error. */
export const MAX_CALLS_PER_ROUND = 3;
/** One assistant call never waits longer than this. */
export const ASSISTANT_CALL_TIMEOUT_MS = 12_000;
/** A call with less time than this left is not started. */
export const MIN_CALL_MS = 2_000;

/** The turn ran out of time before the assistant had answered. */
export class TurnTimeout extends Error {
  constructor() {
    super("The turn ran out of time.");
    this.name = "TurnTimeout";
  }
}

export type AssistantRun = {
  /** The model's answer, before the output check. */
  text: string;
  modelCalls: number;
  toolCalls: Pick<ToolOutcome, "name" | "ok">[];
  handoffIds: string[];
  savedOpportunityIds: string[];
  /** The whole conversation with the model, tool results included, for a revision. */
  messages: ChatMessage[];
};

export type AssistantInput = {
  system: string;
  history: readonly (HistoryTurn & { citations?: readonly Citation[] })[];
  message: string;
  execute: ToolExecutor;
  /** Absolute time (ms) by which the answer must be back. */
  deadline: number;
  chat?: ChatFn;
  now?: () => number;
  onStatus?: (status: string) => void;
  /**
   * Called when the model answers before it has used any tool. A string sends
   * the model back once with that message (it counts as a round); null keeps
   * the answer.
   */
  nudgeWithoutTools?: (answer: string) => string | null;
};

/** What the model is told when it stated facts without looking them up. */
export const LOOK_IT_UP =
  "Look this up with the tools before you answer: every fact needs a cite number from a tool result, and for a question about who may apply, find the opportunity first and use its whoMayApply field.";

/** What the model is told when its last answer, with no tools left, was only a tool call. */
export const ANSWER_NOW = "You cannot call any more tools. Answer the question now from the tool results above, with their cite numbers; if they do not answer it, say so.";

/** A tool call written as text: <TOOLCALL>...</TOOLCALL> or <tool_call>...</tool_call> (unclosed at the end too). */
const TEXT_TOOL_CALL = /<(TOOLCALL|tool_call)>([\s\S]*?)(?:<\/\1>|$)/gi;

/** The reply text without a thinking block or a tool call written as text. */
export function cleanReply(content: string | null | undefined): string {
  return (content ?? "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(TEXT_TOOL_CALL, "")
    .replace(/<function=[\w-]+>[\s\S]*?(?:<\/function>|$)/gi, "")
    .trim();
}

const parameterValue = (raw: string): unknown => {
  const value = raw.trim();
  if (/^[[{]/.test(value)) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
};

/**
 * Tool calls the model wrote into its text instead of as tool_calls, which
 * Nemotron 3.5 sometimes does:
 *
 *   <tool_call> <function=searchOpportunities> <parameter=query> sonar </parameter> </function> </tool_call>
 *   <tool_call>{"name": "searchOpportunities", "arguments": {"query": "sonar"}}</tool_call>
 *
 * Read as the calls they are, so the tool runs and the member never sees the markup.
 */
export function textToolCalls(content: string | null | undefined): ToolCall[] {
  const calls: ToolCall[] = [];
  for (const [, , raw] of (content ?? "").matchAll(TEXT_TOOL_CALL)) {
    const body = raw.trim();
    let name = "";
    let args: Record<string, unknown> = {};
    if (body.startsWith("{")) {
      try {
        const parsed = JSON.parse(body) as { name?: unknown; arguments?: unknown; parameters?: unknown };
        name = typeof parsed.name === "string" ? parsed.name : "";
        const given = parsed.arguments ?? parsed.parameters;
        args = typeof given === "string" ? (parameterValue(given) as Record<string, unknown>) : ((given ?? {}) as Record<string, unknown>);
      } catch {
        continue;
      }
    } else {
      name = body.match(/<function=([\w-]+)>/)?.[1] ?? "";
      for (const [, key, value] of body.matchAll(/<parameter=([\w-]+)>([\s\S]*?)(?=<\/parameter>|<parameter=|<\/function>|$)/g)) args[key] = parameterValue(value);
    }
    if (name) calls.push({ id: `text_call_${calls.length}`, type: "function", function: { name, arguments: JSON.stringify(args) } });
  }
  return calls;
}

export async function runAssistant({ system, history, message, execute, deadline, chat = modelChat, now = Date.now, onStatus, nudgeWithoutTools }: AssistantInput): Promise<AssistantRun> {
  const messages: ChatMessage[] = [
    { role: "system", content: system },
    ...history.slice(-ASSISTANT_HISTORY_TURNS).map((turn): ChatMessage => ({ role: turn.role, content: historyMessage(turn) })),
    { role: "user", content: message },
  ];
  const run: AssistantRun = { text: "", modelCalls: 0, toolCalls: [], handoffIds: [], savedOpportunityIds: [], messages };
  let toldToAnswer = false;

  for (let round = 0; ; round++) {
    const finalRound = round >= MAX_TOOL_ROUNDS;
    const remaining = deadline - now();
    if (remaining < MIN_CALL_MS) throw new TurnTimeout();
    onStatus?.(round === 0 ? "Thinking about your question" : "Writing the answer");

    const response = await chat(
      {
        model: MODEL_FOR.copilot.model,
        max_tokens: 700,
        messages,
        tools: TOOL_DEFINITIONS,
        tool_choice: finalRound ? "none" : "auto",
        effort: MODEL_FOR.copilot.effort,
        cache: true,
      },
      { timeoutMs: Math.min(ASSISTANT_CALL_TIMEOUT_MS, remaining) },
    );
    run.modelCalls++;
    const reply = response.choices[0]?.message;
    const written = textToolCalls(reply?.content);
    const calls = finalRound ? [] : reply?.tool_calls?.length ? reply.tool_calls : written;
    if (!calls.length) {
      run.text = cleanReply(reply?.content);
      // With no tools left the model sometimes still writes a call: ask once for the answer instead.
      if (finalRound && !run.text && written.length && !toldToAnswer) {
        toldToAnswer = true;
        messages.push({ role: "user", content: ANSWER_NOW });
        continue;
      }
      const nudge = !finalRound && !run.toolCalls.length && round === 0 ? nudgeWithoutTools?.(run.text) : null;
      if (!nudge) return run;
      messages.push({ role: "assistant", content: run.text }, { role: "user", content: nudge });
      continue;
    }

    messages.push({
      role: "assistant",
      content: reply?.tool_calls?.length ? (reply.content ?? null) : cleanReply(reply?.content) || null,
      tool_calls: calls,
      // Claude's blocks as returned, thinking included: a tool loop must send them back unchanged.
      ...(reply?.blocks ? { blocks: reply.blocks } : {}),
    });
    for (const [index, call] of calls.entries()) {
      const name = call.function?.name ?? "";
      if (index >= MAX_CALLS_PER_ROUND) {
        messages.push({ role: "tool", tool_call_id: call.id, content: toolResultBlock(name, JSON.stringify({ error: "Too many tool calls at once; this one was skipped." })) });
        continue;
      }
      onStatus?.(TOOL_STATUS[name as ToolName] ?? "Using a tool");
      const outcome = await execute(name, call.function?.arguments ?? "");
      run.toolCalls.push({ name: outcome.name, ok: outcome.ok });
      if (outcome.handoffId) run.handoffIds.push(outcome.handoffId);
      if (outcome.savedOpportunityId) run.savedOpportunityIds.push(outcome.savedOpportunityId);
      messages.push({ role: "tool", tool_call_id: call.id, content: toolResultBlock(name, outcome.content) });
    }
  }
}

/** A revision is only asked for when at least this much time is left. */
export const MIN_REVISION_MS = 5_000;

/**
 * Asks the model once more, without tools, to fix what the output check found
 * (sentences without a cite number). Returns the new answer, or null when
 * there is no time for it or the call fails; the first answer then stands.
 */
export async function reviseAnswer({
  run,
  feedback,
  deadline,
  chat = modelChat,
  now = Date.now,
}: {
  run: AssistantRun;
  feedback: string;
  deadline: number;
  chat?: ChatFn;
  now?: () => number;
}): Promise<string | null> {
  const remaining = deadline - now();
  if (remaining < MIN_REVISION_MS) return null;
  try {
    const response = await chat(
      {
        model: MODEL_FOR.copilot.model,
        max_tokens: 700,
        messages: [...run.messages, { role: "assistant", content: run.text }, { role: "user", content: feedback }],
        tools: TOOL_DEFINITIONS,
        tool_choice: "none",
        effort: MODEL_FOR.copilot.effort,
        cache: true,
      },
      { timeoutMs: Math.min(ASSISTANT_CALL_TIMEOUT_MS, remaining - MIN_CALL_MS) },
    );
    return cleanReply(response.choices[0]?.message.content) || null;
  } catch {
    return null;
  }
}
