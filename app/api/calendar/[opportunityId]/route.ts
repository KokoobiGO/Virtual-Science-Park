import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { withUserDb } from "@/lib/db/user";
import { buildIcs, icsFileName } from "@/lib/week/ics";
import { loadCalendarItem } from "@/lib/week/load";

/**
 * "Add to calendar" on a Your-week card (C4): the opportunity's deadline and
 * event date as an .ics download.
 *
 *   GET /api/calendar/<opportunity id>
 *
 * Signed-in users only; the opportunity is read through withUserDb, so
 * row-level security applies.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/calendar/[opportunityId]">) {
  const viewer = await getViewer();
  if (!viewer) return Response.json({ error: "Sign in first." }, { status: 401 });

  const { opportunityId } = await ctx.params;
  const id = z.uuid().safeParse(opportunityId);
  if (!id.success) return Response.json({ error: "Unknown opportunity." }, { status: 404 });

  const item = await withUserDb(viewer.claims, (tx) => loadCalendarItem(tx, id.data));
  if (!item) return Response.json({ error: "Unknown opportunity." }, { status: 404 });

  const ics = buildIcs(item);
  if (!ics) return Response.json({ error: "This opportunity has no deadline or event date." }, { status: 404 });

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${icsFileName(item.title)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
