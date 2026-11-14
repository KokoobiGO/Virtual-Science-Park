import { getViewer } from "@/lib/auth";
import { withUserDb } from "@/lib/db/user";
import { statusJson } from "@/lib/week/live";
import { loadWeekStatus } from "@/lib/week/load";

/**
 * What the Your-week page polls (C8): the newest week of cards, when they were
 * built and when the profile last changed, so the page knows when to load the
 * new order.
 *
 *   GET /api/week  ->  { weekOf, builtAt, profileChangedAt, pending }
 *
 * Signed-in members only, their own company only: the company comes from the
 * session and every read runs through withUserDb, so row-level security
 * applies (week_cards_own_read, claims_read, company_private_own).
 */
export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return Response.json({ error: "Sign in first." }, { status: 401 });
  const companyId = viewer.role === "member" ? viewer.companyId : null;
  if (!companyId) return Response.json({ error: "Only members have a week of cards." }, { status: 403 });

  const status = await withUserDb(viewer.claims, (tx) => loadWeekStatus(tx, companyId));
  return Response.json(statusJson(status, new Date()), { headers: { "Cache-Control": "private, no-store" } });
}
