import { getViewer } from "@/lib/auth";
import { FetchPageError, publicHttpUrl } from "@/lib/fetcher/fetch-page";
import { inngestCloudProblem, isFinished, sendAndWait } from "@/lib/inngest/runs";

/** Netlify cuts a request off after 30 s, so stop waiting before that. */
const WAIT_MS = 24_000;

/**
 * POST /api/snapshots { url } asks the fetch-snapshot job to fetch the page
 * and store it, then waits for the result. Staff only. The job does the
 * writing: a request never writes snapshots itself.
 */
export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (viewer.role !== "staff") return Response.json({ error: "Staff only." }, { status: 403 });

  const body = (await request.json().catch(() => null)) as { url?: unknown } | null;
  const input = typeof body?.url === "string" ? body.url.trim() : "";
  let url: string;
  try {
    url = publicHttpUrl(/^https?:\/\//i.test(input) ? input : `https://${input}`).href;
  } catch (error) {
    return Response.json({ error: (error as FetchPageError).message }, { status: 400 });
  }

  const problem = inngestCloudProblem();
  if (problem) return Response.json({ error: problem }, { status: 503 });

  try {
    const { eventId, run, seconds } = await sendAndWait(
      { name: "app/snapshot.requested", data: { url, source: "manual" } },
      WAIT_MS,
    );
    if (!run) {
      return Response.json(
        { error: `Inngest accepted event ${eventId} but started no run in ${seconds} s. Sync the app: PUT /api/inngest.` },
        { status: 504 },
      );
    }
    if (run.status === "Completed") return Response.json({ seconds, snapshot: run.output });
    if (isFinished(run)) {
      return Response.json({ error: `The job ${run.status.toLowerCase()}: ${JSON.stringify(run.output ?? null)}` }, { status: 502 });
    }
    return Response.json({ error: `The job was still ${run.status} after ${seconds} s. See the Inngest dashboard.` }, { status: 504 });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 502 });
  }
}
