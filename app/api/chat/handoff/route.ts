import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { HANDOFF_SENT_TEXT, handoffFromAnswer } from "@/lib/copilot/handoff";
import { BSP_CONTACT } from "@/lib/copilot/policy";
import { withUserDb } from "@/lib/db/user";

const Body = z.object({ threadId: z.uuid(), chatId: z.uuid() });

/**
 * POST /api/chat/handoff { threadId, chatId } sends one Copilot answer and the
 * question before it to BSP staff (B10). Members only; the rows are read and
 * written on the member's own database client.
 */
export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (viewer.role !== "member" || !viewer.companyId) {
    return Response.json({ error: "Only member companies can send questions to BSP staff here." }, { status: 403 });
  }
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "threadId and chatId are needed." }, { status: 400 });

  const { companyId, userId, claims } = viewer;
  try {
    const result = await withUserDb(claims, (tx) => handoffFromAnswer(tx, { companyId, userId }, parsed.data));
    if (!result) return Response.json({ error: "That answer was not found in your conversation." }, { status: 404 });
    return Response.json({ sent: true, handoffId: result.id, alreadySent: result.alreadySent, text: HANDOFF_SENT_TEXT, contact: BSP_CONTACT });
  } catch (error) {
    console.error("Copilot handoff failed:", error);
    return Response.json({ error: "The question could not be sent. Please try again." }, { status: 500 });
  }
}
