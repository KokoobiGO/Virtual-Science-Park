"use client";

import { HTML_LANG_SCRIPT } from "@/lib/i18n/config";

/**
 * Sets <html lang> from the language cookie while the browser parses the
 * page, before the first paint (C19). On the server it is a real script; when
 * React renders it in the browser it is inert text/plain, which keeps React
 * from warning about a script in a component (the pattern in Next's
 * "preventing flash before hydration" guide).
 */
export function HtmlLangScript() {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: HTML_LANG_SCRIPT }}
    />
  );
}
