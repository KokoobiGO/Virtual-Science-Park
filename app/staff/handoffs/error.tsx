"use client";

import { RouteError } from "@/components/route-error";

/** Handoffs (C20). */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  // Texts: errors.pages.handoffs in messages/*.json, in the reader's language (C19).
  return <RouteError error={error} retry={retry} page="handoffs" back={{ href: "/staff/compare" }} />;
}
