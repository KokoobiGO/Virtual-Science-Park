/**
 * Chat turns in `chats` (B9), always on the member's own database client:
 * the policies chats_own_read and chats_own_insert keep every row private to
 * the member's company, and staff never read them.
 */
import { and, desc, eq } from "drizzle-orm";
import { chats } from "../db/schema";
import type { UserTx } from "../db/user";
import type { ScopeLabel } from "../schemas";
import type { Citation } from "./sources";
import type { StoredTurn } from "./turn";

/** Rows of a thread loaded as history: three exchanges. */
export const HISTORY_ROWS = 6;

/** The latest turns of one thread of the member's own company, oldest first. */
export async function loadHistory(tx: UserTx, { companyId, threadId }: { companyId: string; threadId: string }): Promise<StoredTurn[]> {
  const rows = await tx
    .select({ role: chats.role, content: chats.content, citations: chats.citations })
    .from(chats)
    .where(and(eq(chats.companyId, companyId), eq(chats.threadId, threadId)))
    .orderBy(desc(chats.createdAt))
    .limit(HISTORY_ROWS);
  return rows.reverse().map((r) => ({ role: r.role, content: r.content, citations: r.citations as Citation[] }));
}

export type TurnToStore = {
  companyId: string;
  userId: string;
  threadId: string;
  message: string;
  /** When the member sent the message: Postgres now() is the same for both rows of one transaction. */
  askedAt: Date;
  label: ScopeLabel;
  answer: string;
  citations: Citation[];
};

/** Stores the member's message and the checked answer as two rows. */
export async function storeTurn(tx: UserTx, turn: TurnToStore): Promise<{ userChatId: string; assistantChatId: string }> {
  const [asked] = await tx
    .insert(chats)
    .values({ companyId: turn.companyId, userId: turn.userId, threadId: turn.threadId, role: "user", content: turn.message, scopeLabel: turn.label, citations: [], createdAt: turn.askedAt })
    .returning({ id: chats.id });
  const [answered] = await tx
    .insert(chats)
    .values({
      companyId: turn.companyId,
      userId: turn.userId,
      threadId: turn.threadId,
      role: "assistant",
      content: turn.answer,
      scopeLabel: turn.label,
      citations: turn.citations,
      createdAt: new Date(Math.max(Date.now(), turn.askedAt.getTime() + 1)),
    })
    .returning({ id: chats.id });
  return { userChatId: asked.id, assistantChatId: answered.id };
}
