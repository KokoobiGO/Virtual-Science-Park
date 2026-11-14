import { getBrief } from "@/lib/scout/queries";
import { memberOrRefusal } from "../member";

/**
 * GET /api/scout/<id>: status, progress lines and, once done, the checked
 * brief. Own company only: another company's id answers 404, because RLS
 * hides the row.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/scout/[id]">) {
  const { member, refusal } = await memberOrRefusal();
  if (refusal) return refusal;
  const { id } = await ctx.params;
  const brief = await getBrief(member, id);
  if (!brief) return Response.json({ error: "No such brief." }, { status: 404 });
  return Response.json(brief, { headers: { "Cache-Control": "no-store" } });
}
