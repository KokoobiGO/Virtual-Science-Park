"use client";

import { RouteError } from "@/components/route-error";

/** Service checks (C20). */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  // Texts: errors.pages.checks in messages/*.json, in the reader's language (C19).
  return <RouteError error={error} retry={retry} page="checks" back={{ href: "/staff/compare" }} />;
}
