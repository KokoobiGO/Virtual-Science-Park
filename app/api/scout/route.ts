import { isCachedMode } from "@/lib/collectors/cache";
import { inngest } from "@/lib/inngest/client";
import { findPrerun, sameQuestion } from "@/lib/scout/prerun";
import { companySlug, copyPrerunBrief, createRunningBrief, failUnsent, listBriefs, prerunRows, runningBrief } from "@/lib/scout/queries";
import { QUESTION_LIMITS, SCOUT_EVENT } from "@/lib/scout/types";
import { memberOrRefusal } from "./member";

/**
 * Scout (B4). Members only; every query runs as the member, so row-level
 * security keeps each company to its own briefs.
 *
 *   GET  /api/scout                  the company's earlier briefs
 *   POST /api/scout { question }     creates a running brief and starts the
 *                                    scout-brief job; answers { id, status }.
 *                                    Poll GET /api/scout/<id> for progress.
 *
 * A run takes a few minutes, far longer than one request may (30 s on
 * Netlify), so the request only creates the row and sends the event. With
 * DEMO_MODE=cached, a question the company has a pre-run brief for
 * (data/scout-briefs) answers with that brief at once.
 */
export async function GET() {
  const { member, refusal } = await memberOrRefusal();
  if (refusal) return refusal;
  return Response.json({ briefs: await listBriefs(member) });
}

export async function POST(request: Request) {
  const { member, refusal } = await memberOrRefusal();
  if (refusal) return refusal;

  const body = (await request.json().catch(() => null)) as { question?: unknown } | null;
  const question = typeof body?.question === "string" ? body.question.replace(/\s+/g, " ").trim() : "";
  if (question.length < QUESTION_LIMITS.min || question.length > QUESTION_LIMITS.max) {
    return Response.json({ error: `Ask a question of ${QUESTION_LIMITS.min} to ${QUESTION_LIMITS.max} characters.` }, { status: 400 });
  }

  if (isCachedMode()) {
    const stored = (await prerunRows(member)).find((row) => sameQuestion(row.question, question));
    if (stored) return Response.json({ id: stored.id, status: "done", cached: true });
    const slug = await companySlug(member);
    const file = slug ? findPrerun(slug, question) : null;
    if (file) {
      const id = await copyPrerunBrief(member, { question: file.question, brief: file.brief, searchCount: file.searchCount });
      return Response.json({ id, status: "done", cached: true });
    }
  }

  // One run at a time per company: the model key is shared and rate limited.
  const running = await runningBrief(member);
  if (running) return Response.json({ error: "Scout is still working on your last question. Wait for it to finish.", id: running.id }, { status: 409 });

  const id = await createRunningBrief(member, question);
  try {
    await inngest.send({ name: SCOUT_EVENT, data: { briefId: id } });
  } catch (error) {
    const message = `Scout could not be started: ${error instanceof Error ? error.message : String(error)}`;
    await failUnsent(member, id, message);
    return Response.json({ error: message, id }, { status: 502 });
  }
  return Response.json({ id, status: "running" }, { status: 202 });
}
