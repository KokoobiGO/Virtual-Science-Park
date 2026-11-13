/**
 * Session refresh for proxy.ts. Keeps the Supabase auth cookies fresh and
 * returns the verified role so the proxy can make optimistic redirects. The
 * pages check the role again on the server; this is not the security boundary,
 * row-level security is.
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { AppMetadata } from "../schemas";
import { supabaseEnv } from "./env";

export async function updateSession(request: NextRequest) {
  const { url, key } = supabaseEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
      },
    },
  });

  // Do not run code between createServerClient and getClaims: it refreshes the session.
  const { data } = await supabase.auth.getClaims();
  const metadata = AppMetadata.safeParse(data?.claims?.app_metadata);

  return {
    response,
    signedIn: Boolean(data?.claims?.sub),
    role: metadata.success ? metadata.data.role : null,
  };
}
