import { getViewer } from "@/lib/auth";
import { isResendCheckId, RESEND_CHECKS, runResendCheck } from "@/lib/resend-checks";

/**
 * GET /api/checks/resend?check=<id> sends one test email with this deploy's
 * RESEND_API_KEY to Resend's test inbox. Staff only.
 */
export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (viewer.role !== "staff") return Response.json({ error: "Staff only." }, { status: 403 });

  const id = new URL(request.url).searchParams.get("check");
  if (!isResendCheckId(id)) {
    return Response.json({ error: `Unknown check. Use one of: ${Object.keys(RESEND_CHECKS).join(", ")}` }, { status: 400 });
  }

  return Response.json(await runResendCheck(id));
}
