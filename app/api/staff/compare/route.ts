import { getViewer } from "@/lib/auth";
import { parseSlugPair } from "@/lib/staff-views/compare";
import { loadComparison } from "@/lib/staff-views/query";

/**
 * GET /api/staff/compare?a=<slug>&b=<slug> (C9), staff only: both members' top
 * five from the public ranking, with the opportunities in both marked. The
 * same data as the /staff/compare page.
 *
 *   401 signed out, 403 a member account, 400 a missing or bad slug,
 *   404 a slug that is no member.
 */
export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (viewer.role !== "staff") return Response.json({ error: "Staff only." }, { status: 403 });

  const params = new URL(request.url).searchParams;
  const pair = parseSlugPair(params.get("a"), params.get("b"));
  if (!pair.ok) return Response.json({ error: pair.error }, { status: 400 });

  const result = await loadComparison(viewer.claims, pair.a, pair.b);
  if (!result.ok) return Response.json({ error: result.error }, { status: 404 });
  return Response.json(result.comparison);
}
