/**
 * One Copilot turn (B5, B7, B8): classifier, then the fixed reply, one
 * clarifying question or the assistant, then the output check. Nothing here
 * touches the database directly; the tools do, through the executor the
 * caller builds. Never throws: when time runs out or the model fails, the
 * member gets a fixed fallback text.
 *
 * Model calls per turn: 1 (classifier) for out-of-scope, override and unclear
 * turns; 1 + 1 to 4 (assistant, up to MAX_TOOL_ROUNDS tool rounds) otherwise.
 */
import { NvidiaApiError, nvidiaChat } from "../nvidia";
import type { ScopeLabel } from "../schemas";
import { LOOK_IT_UP, reviseAnswer, runAssistant, TurnTimeout } from "./assistant";
import { asksEligibility, checkAnswer, soundsLikeEligibilityDecision, statesFacts } from "./check";
import { CLASSIFIER_TIMEOUT_MS, classifyTurn, type ChatFn, type Classification, type HistoryTurn } from "./classifier";
import { DEFAULT_CLARIFYING_QUESTION, OUT_OF_SCOPE_REPLY } from "./policy";
import { buildAssistantSystemPrompt } from "./prompt";
import type { Citation, SourceRegistry } from "./sources";
import type { ToolExecutor } from "./tools";

/**
 * From the start of the request to a checked answer. Netlify cuts a request
 * off at 30 s; the rest is for loading the history, storing the turn and the
 * network. With nemotron-3.5-super-vl-120b-a12b the 51 red-team turns
 * (2026-11-14) took 1 s at the median and 6.1 s at the slowest.
 */
export const TURN_BUDGET_MS = 23_000;

export const FALLBACK_TIMEOUT_REPLY =
  "I could not finish an answer in time. Please try again in a moment, or send your question to BSP staff.";
export const FALLBACK_BUSY_REPLY = "The Copilot is busy right now. Please try again in a minute, or send your question to BSP staff.";
export const FALLBACK_ERROR_REPLY = "Something went wrong while answering. Please try again, or send your question to BSP staff.";

/** An earlier turn as stored in `chats`. */
export type StoredTurn = HistoryTurn & { citations?: Citation[] };

export type TurnInput = {
  message: string;
  history: readonly StoredTurn[];
  companyName: string;
  /** When the request started (ms since epoch), for the deadline. */
  startedAt?: number;
};

export type TurnDeps = {
  executeTool: ToolExecutor;
  /** The registry the executor fills; the output check reads it. */
  sources: SourceRegistry;
  chat?: ChatFn;
  now?: () => number;
  onStatus?: (status: string) => void;
  budgetMs?: number;
};

export type TurnOutcome = "answer" | "fixed_reply" | "clarify" | "timeout" | "busy" | "error";

export type TurnResult = {
  label: ScopeLabel;
  text: string;
  citations: Citation[];
  outcome: TurnOutcome;
  handoffIds: string[];
  savedOpportunityIds: string[];
  modelCalls: number;
  toolCalls: { name: string; ok: boolean }[];
  seconds: number;
  /** What the output check changed. */
  changes: string[];
  classifier: Pick<Classification, "decidedBy" | "error">;
};

const flat = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * The assistant's text without the fixed reply. The small model sometimes
 * ends a good answer with it; then the answer stands and the sentence goes.
 * An empty result means the assistant gave the fixed reply and nothing else.
 */
export function withoutFixedReply(text: string): string {
  const start = OUT_OF_SCOPE_REPLY.slice(0, 40);
  const lines = text.split("\n").filter((line) => !flat(line).includes(start));
  return lines.join("\n").trim();
}

/** The assistant answered with the fixed reply and nothing else. */
export function isFixedReply(text: string): boolean {
  return flat(text).includes(OUT_OF_SCOPE_REPLY.slice(0, 40)) && !withoutFixedReply(text);
}

const REMOVED = "Removed a sentence without a source: ";

/** The sentences the output check removed for want of a citation. */
function removedSentences(changes: readonly string[]): string[] {
  return changes.filter((c) => c.startsWith(REMOVED)).map((c) => c.slice(REMOVED.length).replace(/^"|"$/g, ""));
}

/** What the model is told when its answer had sentences without a cite number. */
export function citationFeedback(sentences: readonly string[]): string {
  return [
    "These sentences of your answer state facts but have no cite number, so they would be removed:",
    ...sentences.slice(0, 6).map((s) => `- "${s}"`),
    "Write the whole answer again. End every sentence that states a fact with the cite number of the tool result it comes from, like [1]. Leave out any sentence you cannot cite. Do not add anything else.",
  ].join("\n");
}

export async function runTurn(input: TurnInput, deps: TurnDeps): Promise<TurnResult> {
  const now = deps.now ?? Date.now;
  const started = input.startedAt ?? now();
  const deadline = started + (deps.budgetMs ?? TURN_BUDGET_MS);
  const seconds = () => Math.round((now() - started) / 100) / 10;
  let calls = 0;
  const chat: ChatFn = (request, options) => {
    calls++;
    return (deps.chat ?? nvidiaChat)(request, options);
  };

  deps.onStatus?.("Checking the question");
  const classification = await classifyTurn(input.history, input.message, {
    chat,
    timeoutMs: Math.max(1_000, Math.min(CLASSIFIER_TIMEOUT_MS, deadline - now())),
  });
  const base = {
    citations: [] as Citation[],
    handoffIds: [] as string[],
    savedOpportunityIds: [] as string[],
    toolCalls: [] as { name: string; ok: boolean }[],
    changes: [] as string[],
    classifier: { decidedBy: classification.decidedBy, ...(classification.error ? { error: classification.error } : {}) },
  };

  if (classification.label === "out_of_scope" || classification.label === "override_attempt") {
    return { ...base, label: classification.label, text: OUT_OF_SCOPE_REPLY, outcome: "fixed_reply", modelCalls: calls, seconds: seconds() };
  }
  if (classification.label === "unclear") {
    const question = classification.question && !soundsLikeEligibilityDecision(classification.question) ? classification.question : DEFAULT_CLARIFYING_QUESTION;
    return { ...base, label: "unclear", text: question, outcome: "clarify", modelCalls: calls, seconds: seconds() };
  }

  const toolCalls: { name: string; ok: boolean }[] = [];
  try {
    const run = await runAssistant({
      system: buildAssistantSystemPrompt({ companyName: input.companyName, today: new Date(now()) }),
      history: input.history,
      message: input.message,
      execute: async (name, args) => {
        const outcome = await deps.executeTool(name, args);
        toolCalls.push({ name: outcome.name, ok: outcome.ok });
        return outcome;
      },
      deadline,
      chat,
      now,
      onStatus: deps.onStatus,
      // An answer with facts but no tool call, or an eligibility question answered from memory or with the
      // fixed reply (the classifier already found it in scope): look it up first.
      nudgeWithoutTools: (answer) =>
        asksEligibility(input.message) || (!isFixedReply(answer) && statesFacts(withoutFixedReply(answer), input.companyName)) ? LOOK_IT_UP : null,
    });

    if (isFixedReply(run.text) && !run.handoffIds.length) {
      return { ...base, toolCalls, label: "out_of_scope", text: OUT_OF_SCOPE_REPLY, outcome: "fixed_reply", modelCalls: calls, seconds: seconds() };
    }

    deps.onStatus?.("Checking the answer");
    const check = (text: string) =>
      checkAnswer({
        text: withoutFixedReply(text),
        sources: deps.sources.all(),
        askedEligibility: asksEligibility(input.message),
        handoffSent: run.handoffIds.length > 0,
        savedOpportunityIds: run.savedOpportunityIds,
        companyName: input.companyName,
      });
    let checked = check(run.text);

    // Sentences without a cite number would be removed: ask the model once to cite or drop them.
    const uncited = removedSentences(checked.changes);
    if (uncited.length) {
      deps.onStatus?.("Adding sources to the answer");
      const revised = await reviseAnswer({ run, feedback: citationFeedback(uncited), deadline, chat, now });
      if (revised) {
        const second = check(revised);
        if (removedSentences(second.changes).length < uncited.length) checked = { ...second, changes: [...checked.changes.map((c) => `first answer: ${c}`), ...second.changes] };
      }
    }
    return {
      ...base,
      label: "in_scope",
      text: checked.text,
      citations: checked.citations,
      changes: checked.changes,
      outcome: "answer",
      handoffIds: run.handoffIds,
      savedOpportunityIds: run.savedOpportunityIds,
      toolCalls,
      modelCalls: calls,
      seconds: seconds(),
    };
  } catch (error) {
    const timedOut = error instanceof TurnTimeout || (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError"));
    const busy = error instanceof NvidiaApiError && error.status === 429;
    if (!timedOut && !busy) console.error("Copilot turn failed:", error);
    return {
      ...base,
      toolCalls,
      label: "in_scope",
      text: timedOut ? FALLBACK_TIMEOUT_REPLY : busy ? FALLBACK_BUSY_REPLY : FALLBACK_ERROR_REPLY,
      outcome: timedOut ? "timeout" : busy ? "busy" : "error",
      modelCalls: calls,
      seconds: seconds(),
    };
  }
}
