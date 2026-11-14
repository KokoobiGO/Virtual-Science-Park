import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { handleChatTurn } from "@/lib/copilot/chat";
import { MAX_MESSAGE_CHARS } from "@/lib/copilot/classifier";
import type { DbRunner } from "@/lib/copilot/tools";
import { withUserDb } from "@/lib/db/user";

const Body = z.object({
  message: z.string().trim().min(1).max(MAX_MESSAGE_CHARS),
  threadId: z.uuid().optional(),
});

/**
 * POST /api/chat { message, threadId? } runs one Copilot turn for a signed-in
 * member: scope classifier, assistant with tools, output check, then stores
 * the turn in `chats` for the member's company.
 *
 * The answer is a text/event-stream: `status` events while it works, then one
 * `final` event with the checked answer (or `error`). Unchecked model text is
 * never sent.
 */
export async function POST(request: Request) {
  const startedAt = Date.now();
  const viewer = await getViewer();
  if (!viewer) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (viewer.role !== "member" || !viewer.companyId) {
    return Response.json({ error: "The Copilot is for member companies." }, { status: 403 });
  }
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: `Send a message of 1 to ${MAX_MESSAGE_CHARS} characters.` }, { status: 400 });
  }

  const { claims, companyId, userId } = viewer;
  const threadId = parsed.data.threadId ?? randomUUID();
  const db: DbRunner = (run) => withUserDb(claims, run);
  const encoder = new TextEncoder();
  // The browser may leave mid-turn; the turn still finishes and is stored.
  let open = true;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: "status" | "final" | "error", data: unknown) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          open = false;
        }
      };
      try {
        const reply = await handleChatTurn(
          { companyId, userId, threadId, message: parsed.data.message, startedAt },
          { db, onStatus: (text) => send("status", { text }) },
        );
        send("final", reply);
      } catch (error) {
        console.error("Copilot request failed:", error);
        send("error", { message: "Something went wrong. Please try again, or send your question to BSP staff." });
      } finally {
        if (open) {
          open = false;
          controller.close();
        }
      }
    },
    cancel() {
      open = false;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
