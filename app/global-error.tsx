"use client";

import { RouteError } from "@/components/route-error";
import "./globals.css";

/**
 * When the root layout itself fails (C20). It replaces the whole document, so
 * it brings its own html, body, styles and title; the header and menu are gone.
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <title>Something went wrong · Virtual Science Park</title>
        <main className="flex flex-1 flex-col">
          <RouteError
            error={error}
            retry={retry}
            title="Virtual Science Park could not be loaded"
            what="Something went wrong on our side before the page could be shown."
          />
        </main>
      </body>
    </html>
  );
}
