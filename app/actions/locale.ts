"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, parseLocale } from "@/lib/i18n/config";

/**
 * The language switch (C19): store the choice in a cookie and draw the page
 * again in that language. The cookie is not tied to the session, so the
 * choice outlives sign-in and sign-out. Form field: locale ("en" or "sv").
 */
export async function setLocale(formData: FormData) {
  const locale = parseLocale(formData.get("locale"));
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: "lax",
    // Read by the inline script that sets <html lang> before the first paint.
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
  });
  refresh();
}
