import { getViewer } from "@/lib/auth";
import { INNGEST_CHECKS, isInngestCheckId, runInngestCheck } from "@/lib/inngest-checks";

/**
 * GET /api/checks/inngest?check=<id> sends a test event with this deploy's
 * Inngest keys and waits for the run. Staff only.
 */
export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (viewer.role !== "staff") return Response.json({ error: "Staff only." }, { status: 403 });

  const id = new URL(request.url).searchParams.get("check");
  if (!isInngestCheckId(id)) {
    return Response.json({ error: `Unknown check. Use one of: ${Object.keys(INNGEST_CHECKS).join(", ")}` }, { status: 400 });
  }

  return Response.json(await runInngestCheck(id));
}
