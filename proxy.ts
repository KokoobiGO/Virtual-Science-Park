import { NextResponse, type NextRequest } from "next/server";
import { HOME, ROLE_ONLY, SIGNED_IN_ONLY } from "./lib/navigation";
import { updateSession } from "./lib/supabase/proxy";

const startsWith = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

export async function proxy(request: NextRequest) {
  const { response, signedIn, role } = await updateSession(request);
  const path = request.nextUrl.pathname;

  if (!signedIn && SIGNED_IN_ONLY.some((p) => startsWith(path, p))) {
    const url = new URL("/sign-in", request.url);
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  const rule = ROLE_ONLY.find((r) => startsWith(path, r.prefix));
  if (signedIn && rule && role !== rule.role) {
    return NextResponse.redirect(new URL(role ? HOME[role] : "/", request.url));
  }

  return response;
}

export const config = {
  // Everything except static files, images and the Inngest endpoint.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/inngest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
