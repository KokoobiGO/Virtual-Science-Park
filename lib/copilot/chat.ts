/**
 * One chat request (B9): load the thread, run the turn, store it. Every
 * database step runs on the member's own client (`db`, built from
 * withUserDb), so row-level security applies throughout.
 */
import { eq } from "drizzle-orm";
import { companies } from "../db/schema";
import type { ScopeLabel } from "../schemas";
import type { ChatFn } from "./classifier";
import { SourceRegistry, type Citation } from "./sources";
import { loadHistory, storeTurn } from "./store";
import { makeToolExecutor, type DbRunner } from "./tools";
import { runTurn, type TurnOutcome } from "./turn";

export type ChatTurnInput = {
  companyId: string;
  userId: string;
  threadId: string;
  message: string;
  /** When the request arrived (ms since epoch). */
  startedAt: number;
};

/** What the browser gets: the checked answer only, never unchecked text. */
export type ChatTurnReply = {
  threadId: string;
  /** The stored assistant row, for "send to BSP staff". Null when storing failed. */
  chatId: string | null;
  label: ScopeLabel;
  text: string;
  citations: Citation[];
  handoffSent: boolean;
  outcome: TurnOutcome;
  modelCalls: number;
  seconds: number;
};

export async function handleChatTurn(
  input: ChatTurnInput,
  { db, chat, onStatus }: { db: DbRunner; chat?: ChatFn; onStatus?: (status: string) => void },
): Promise<ChatTurnReply> {
  const askedAt = new Date(input.startedAt);
  const { history, companyName } = await db(async (tx) => {
    const [company] = await tx.select({ name: companies.name }).from(companies).where(eq(companies.id, input.companyId));
    return { history: await loadHistory(tx, input), companyName: company?.name ?? "your company" };
  });

  const sources = new SourceRegistry();
  const executeTool = makeToolExecutor(db, { companyId: input.companyId, userId: input.userId, threadId: input.threadId, question: input.message }, sources);
  const result = await runTurn({ message: input.message, history, companyName, startedAt: input.startedAt }, { executeTool, sources, chat, onStatus });

  onStatus?.("Saving the conversation");
  let chatId: string | null = null;
  try {
    const stored = await db((tx) =>
      storeTurn(tx, {
        companyId: input.companyId,
        userId: input.userId,
        threadId: input.threadId,
        message: input.message,
        askedAt,
        label: result.label,
        answer: result.text,
        citations: result.citations,
      }),
    );
    chatId = stored.assistantChatId;
  } catch (error) {
    console.error("Copilot: storing the turn failed:", error);
  }

  console.info(
    `copilot turn: label=${result.label} outcome=${result.outcome} classifier=${result.classifier.decidedBy} modelCalls=${result.modelCalls} tools=${result.toolCalls.map((t) => t.name).join(",") || "-"} seconds=${result.seconds} changes=${result.changes.length}`,
  );

  return {
    threadId: input.threadId,
    chatId,
    label: result.label,
    text: result.text,
    citations: result.citations,
    handoffSent: result.handoffIds.length > 0,
    outcome: result.outcome,
    modelCalls: result.modelCalls,
    seconds: result.seconds,
  };
}
