/**
 * The assistant (B7): the main model with the Copilot's tools, in our own
 * loop (the NVIDIA API has no tool runner). At most MAX_TOOL_ROUNDS rounds of
 * tool calls; after that the model must answer with what it has. Every call
 * gets a timeout that ends before the turn's deadline, because Netlify cuts a
 * request off at 30 s.
 */
import { NVIDIA_MODELS, nvidiaChat, type ChatMessage } from "../nvidia";
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

/** The reply text without a thinking block or a tool call written as text. */
export function cleanReply(content: string | null | undefined): string {
  return (content ?? "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<TOOLCALL>[\s\S]*?(<\/TOOLCALL>|$)/gi, "")
    .trim();
}

export async function runAssistant({ system, history, message, execute, deadline, chat = nvidiaChat, now = Date.now, onStatus, nudgeWithoutTools }: AssistantInput): Promise<AssistantRun> {
  const messages: ChatMessage[] = [
    { role: "system", content: system },
    ...history.slice(-ASSISTANT_HISTORY_TURNS).map((turn): ChatMessage => ({ role: turn.role, content: historyMessage(turn) })),
    { role: "user", content: message },
  ];
  const run: AssistantRun = { text: "", modelCalls: 0, toolCalls: [], handoffIds: [], savedOpportunityIds: [], messages };

  for (let round = 0; ; round++) {
    const finalRound = round >= MAX_TOOL_ROUNDS;
    const remaining = deadline - now();
    if (remaining < MIN_CALL_MS) throw new TurnTimeout();
    onStatus?.(round === 0 ? "Thinking about your question" : "Writing the answer");

    const response = await chat(
      {
        model: NVIDIA_MODELS.main,
        max_tokens: 700,
        temperature: 0,
        messages,
        tools: TOOL_DEFINITIONS,
        tool_choice: finalRound ? "none" : "auto",
        chat_template_kwargs: { enable_thinking: false },
      },
      { timeoutMs: Math.min(ASSISTANT_CALL_TIMEOUT_MS, remaining) },
    );
    run.modelCalls++;
    const reply = response.choices[0]?.message;
    const calls = finalRound ? [] : (reply?.tool_calls ?? []);
    if (!calls.length) {
      run.text = cleanReply(reply?.content);
      const nudge = !finalRound && !run.toolCalls.length && round === 0 ? nudgeWithoutTools?.(run.text) : null;
      if (!nudge) return run;
      messages.push({ role: "assistant", content: run.text }, { role: "user", content: nudge });
      continue;
    }

    messages.push({ role: "assistant", content: reply?.content ?? null, tool_calls: calls });
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
  chat = nvidiaChat,
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
        model: NVIDIA_MODELS.main,
        max_tokens: 700,
        temperature: 0,
        messages: [...run.messages, { role: "assistant", content: run.text }, { role: "user", content: feedback }],
        tools: TOOL_DEFINITIONS,
        tool_choice: "none",
        chat_template_kwargs: { enable_thinking: false },
      },
      { timeoutMs: Math.min(ASSISTANT_CALL_TIMEOUT_MS, remaining - MIN_CALL_MS) },
    );
    return cleanReply(response.choices[0]?.message.content) || null;
  } catch {
    return null;
  }
}
