import { getViewer } from "@/lib/auth";
import { isModelCheckId, keyHint, MODEL_CHECKS, runModelCheck } from "@/lib/model-checks";

/**
 * GET /api/checks/models?check=<id> runs one Claude API check on the server,
 * with this deploy's ANTHROPIC_API_KEY. Staff only: each call costs a little
 * money. One check per request keeps each call well inside the function time
 * limit, and lets /staff/checks run them in parallel.
 */
export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (viewer.role !== "staff") return Response.json({ error: "Staff only." }, { status: 403 });

  const id = new URL(request.url).searchParams.get("check");
  if (!isModelCheckId(id)) {
    return Response.json({ error: `Unknown check. Use one of: ${Object.keys(MODEL_CHECKS).join(", ")}` }, { status: 400 });
  }

  const result = await runModelCheck(id);
  return Response.json({ ...result, hint: keyHint([result]) });
}
