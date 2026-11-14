"use client";

import { RouteError } from "@/components/route-error";

/** The ecosystem map (C20). */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  // Texts: errors.pages.ecosystem in messages/*.json, in the reader's language (C19).
  return <RouteError error={error} retry={retry} page="ecosystem" back={{ href: "/staff/compare" }} />;
}
