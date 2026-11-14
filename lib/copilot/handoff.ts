/**
 * Handoffs (B10): a member passes a question to BSP staff on purpose. One row
 * in `handoffs`, written on the member's own database client, so the policy
 * handoffs_member_insert checks that the company and user are the signed-in
 * ones. Staff read the rows on /staff/handoffs (policy handoffs_read).
 */
import { and, desc, eq, lte, sql } from "drizzle-orm";
import { chats, handoffs } from "../db/schema";
import type { UserTx } from "../db/user";
import { BSP_CONTACT } from "./policy";

export const MAX_TOPIC_CHARS = 120;
export const MAX_MESSAGE_CHARS = 2000;

/** What the member sees after a handoff. */
export const HANDOFF_SENT_TEXT = "Your question was sent to BSP staff.";

export type HandoffInput = {
  topic: string;
  message: string;
  /** What staff need to understand the question, e.g. the thread and the answer it came from. Chats stay private, so copy it here. */
  context?: Record<string, unknown>;
};

const cut = (text: string, max: number) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}\u2026` : flat;
};

export async function createHandoff(
  tx: UserTx,
  who: { companyId: string; userId: string },
  input: HandoffInput,
): Promise<{ id: string; createdAt: Date; contactRoute: string }> {
  const topic = cut(input.topic, MAX_TOPIC_CHARS) || "Question from the Copilot";
  const message = cut(input.message, MAX_MESSAGE_CHARS);
  if (!message) throw new Error("A handoff needs a message.");
  const [row] = await tx
    .insert(handoffs)
    .values({ companyId: who.companyId, userId: who.userId, topic, message, contactRoute: BSP_CONTACT, context: input.context ?? null })
    .returning({ id: handoffs.id, createdAt: handoffs.createdAt, contactRoute: handoffs.contactRoute });
  return row;
}

/**
 * The panel's "send to BSP staff" button: hands one answer and the question
 * before it to staff. Both are read from the member's own thread (never from
 * what the browser sends), and pressing twice sends once.
 */
export async function handoffFromAnswer(
  tx: UserTx,
  who: { companyId: string; userId: string },
  { threadId, chatId }: { threadId: string; chatId: string },
): Promise<{ id: string; alreadySent: boolean } | null> {
  const [answer] = await tx
    .select({ id: chats.id, content: chats.content, citations: chats.citations, createdAt: chats.createdAt })
    .from(chats)
    .where(and(eq(chats.id, chatId), eq(chats.threadId, threadId), eq(chats.companyId, who.companyId), eq(chats.role, "assistant")));
  if (!answer) return null;

  const [earlier] = await tx
    .select({ id: handoffs.id })
    .from(handoffs)
    .where(and(eq(handoffs.companyId, who.companyId), sql`${handoffs.context} ->> 'chatId' = ${chatId}`));
  if (earlier) return { id: earlier.id, alreadySent: true };

  const [question] = await tx
    .select({ content: chats.content })
    .from(chats)
    .where(and(eq(chats.threadId, threadId), eq(chats.companyId, who.companyId), eq(chats.role, "user"), lte(chats.createdAt, answer.createdAt)))
    .orderBy(desc(chats.createdAt))
    .limit(1);

  const row = await createHandoff(tx, who, {
    topic: "Question from the Copilot",
    message: question?.content ?? answer.content,
    context: { via: "copilot_button", threadId, chatId, answer: answer.content.slice(0, MAX_MESSAGE_CHARS), citations: answer.citations },
  });
  return { id: row.id, alreadySent: false };
}
