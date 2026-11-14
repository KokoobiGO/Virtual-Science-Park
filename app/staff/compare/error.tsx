"use client";

import { RouteError } from "@/components/route-error";

/** Compare members (C20). */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  // Texts: errors.pages.compare in messages/*.json, in the reader's language (C19).
  return <RouteError error={error} retry={retry} page="compare" back={{ href: "/staff/compare" }} />;
}
