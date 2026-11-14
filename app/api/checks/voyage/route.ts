import { getViewer } from "@/lib/auth";
import { isVoyageCheckId, runVoyageCheck, VOYAGE_CHECKS } from "@/lib/voyage-checks";

/**
 * GET /api/checks/voyage?check=<id> embeds one text with this deploy's
 * VOYAGE_API_KEY. Staff only.
 */
export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (viewer.role !== "staff") return Response.json({ error: "Staff only." }, { status: 403 });

  const id = new URL(request.url).searchParams.get("check");
  if (!isVoyageCheckId(id)) {
    return Response.json({ error: `Unknown check. Use one of: ${Object.keys(VOYAGE_CHECKS).join(", ")}` }, { status: 400 });
  }

  return Response.json(await runVoyageCheck(id));
}
