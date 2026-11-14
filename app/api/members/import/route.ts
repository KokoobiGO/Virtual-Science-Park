import { getViewer } from "@/lib/auth";
import { inngest } from "@/lib/inngest/client";
import { inngestCloudProblem, isFinished, runsFor } from "@/lib/inngest/runs";

/**
 * The member import (A2) takes about a minute, longer than one request may
 * wait, so it is two calls. Staff only.
 *
 *   POST /api/members/import            starts the job, answers { eventId }
 *   GET  /api/members/import?event=<id> answers { status, output } for polling
 */
async function staffOnly(): Promise<Response | null> {
  const viewer = await getViewer();
  if (!viewer) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (viewer.role !== "staff") return Response.json({ error: "Staff only." }, { status: 403 });
  const problem = inngestCloudProblem();
  return problem ? Response.json({ error: problem }, { status: 503 }) : null;
}

export async function POST() {
  const refused = await staffOnly();
  if (refused) return refused;
  try {
    const { ids } = await inngest.send({ name: "app/members.import.requested", data: { from: "staff" } });
    return Response.json({ eventId: ids[0] });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 502 });
  }
}

export async function GET(request: Request) {
  const refused = await staffOnly();
  if (refused) return refused;
  const eventId = new URL(request.url).searchParams.get("event") ?? "";
  if (!/^[0-9A-Za-z]{10,40}$/.test(eventId)) return Response.json({ error: "Unknown event." }, { status: 400 });
  try {
    const [run] = await runsFor(eventId);
    if (!run) return Response.json({ status: "Queued", finished: false });
    return Response.json({ status: run.status, finished: isFinished(run), output: run.output ?? null });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 502 });
  }
}
