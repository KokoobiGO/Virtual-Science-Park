/**
 * Data access layer for the signed-in user (S7).
 *
 * The role and company come from app_metadata in the verified access token.
 * Call these from components inside a <Suspense> boundary: with Cache
 * Components a session read is request-time data.
 */
import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import type { JwtClaims } from "./db/user";
import { AppMetadata, type AppRole } from "./schemas";
import { createClient } from "./supabase/server";

export type Viewer = {
  userId: string;
  email: string | null;
  displayName: string | null;
  role: AppRole;
  /** Set for members, null for staff. */
  companyId: string | null;
  /** Verified token claims, for withUserDb(). */
  claims: JwtClaims;
};

/** The signed-in user, or null. One read per request. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  // Token checks compare expiry with the clock, so this must run at request
  // time, not during a prefetch render that already has the cookies.
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;

  const metadata = AppMetadata.safeParse(data.claims.app_metadata);
  if (!metadata.success) return null; // signed in, but no role: treat as signed out

  const userMetadata = (data.claims.user_metadata ?? {}) as { display_name?: string };
  return {
    userId: data.claims.sub,
    email: typeof data.claims.email === "string" ? data.claims.email : null,
    displayName: userMetadata.display_name ?? null,
    role: metadata.data.role,
    companyId: metadata.data.role === "member" ? metadata.data.company_id : null,
    claims: data.claims as JwtClaims,
  };
});

/** The signed-in user with the given role, or a redirect. */
export async function requireRole(role: AppRole): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in");
  if (viewer.role !== role) redirect("/");
  return viewer;
}
