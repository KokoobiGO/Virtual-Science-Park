import { getViewer } from "@/lib/auth";
import type { Member } from "@/lib/scout/queries";

/** The signed-in member, or the response that refuses everyone else. Scout is for members only. */
export async function memberOrRefusal(): Promise<{ member: Member; refusal: null } | { member: null; refusal: Response }> {
  const viewer = await getViewer();
  if (!viewer) return { member: null, refusal: Response.json({ error: "Sign in first." }, { status: 401 }) };
  if (viewer.role !== "member" || !viewer.companyId) {
    return { member: null, refusal: Response.json({ error: "Scout is for member companies only." }, { status: 403 }) };
  }
  return { member: { claims: viewer.claims, userId: viewer.userId, companyId: viewer.companyId }, refusal: null };
}
