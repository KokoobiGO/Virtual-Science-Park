import { getViewer } from "@/lib/auth";
import { isNvidiaCheckId, keyHint, NVIDIA_CHECKS, runNvidiaCheck } from "@/lib/nvidia-checks";

/**
 * GET /api/checks/nvidia?check=<id> runs one NVIDIA API check on the server,
 * with this deploy's NVIDIA_API_KEY. Staff only: each call spends free-tier
 * requests. One check per request keeps each call well inside the function
 * time limit, and lets /staff/checks run them in parallel.
 */
export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (viewer.role !== "staff") return Response.json({ error: "Staff only." }, { status: 403 });

  const id = new URL(request.url).searchParams.get("check");
  if (!isNvidiaCheckId(id)) {
    return Response.json({ error: `Unknown check. Use one of: ${Object.keys(NVIDIA_CHECKS).join(", ")}` }, { status: 400 });
  }

  const result = await runNvidiaCheck(id);
  return Response.json({ ...result, hint: keyHint([result]) });
}
