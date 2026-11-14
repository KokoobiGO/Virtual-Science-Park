"use client";

import { RouteError } from "@/components/route-error";

/** The data status page (C20). */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  // Texts: errors.pages.sources in messages/*.json, in the reader's language (C19).
  return <RouteError error={error} retry={retry} page="sources" back={{ href: "/" }} />;
}
