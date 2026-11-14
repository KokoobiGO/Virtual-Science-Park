import { setOptionSaved } from "@/lib/scout/queries";
import { memberOrRefusal } from "../../member";

/**
 * POST /api/scout/<id>/save { opportunityId, saved }: saves (or unsaves) one
 * option of a brief in saved_items, as the member. Only options that come
 * from the opportunity store have an opportunityId; the brief itself stays in
 * the company's list of briefs either way.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/scout/[id]/save">) {
  const { member, refusal } = await memberOrRefusal();
  if (refusal) return refusal;
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => null)) as { opportunityId?: unknown; saved?: unknown } | null;
  const opportunityId = typeof body?.opportunityId === "string" ? body.opportunityId : "";
  const saved = body?.saved !== false;
  const ok = await setOptionSaved(member, id, opportunityId, saved);
  if (!ok) return Response.json({ error: "No such option in this brief." }, { status: 404 });
  return Response.json({ opportunityId, saved });
}
