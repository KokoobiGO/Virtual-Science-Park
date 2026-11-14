"use client";

import { RouteError } from "@/components/route-error";
import { useLocale, useT } from "@/lib/i18n/client";
import "./globals.css";

/**
 * When the root layout itself fails (C20). It replaces the whole document, so
 * it brings its own html, body, styles and title; the header and menu are gone.
 * There is no server above it to give the language, so it reads the cookie in
 * the browser (C19).
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const locale = useLocale();
  const t = useT("errors");
  return (
    <html lang={locale} className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <title>{t("globalDocumentTitle")}</title>
        <main className="flex flex-1 flex-col">
          <RouteError error={error} retry={retry} page="global" />
        </main>
      </body>
    </html>
  );
}
