"use client";

import { RouteError } from "@/components/route-error";

/** The planted instruction test (C20). */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  // Texts: errors.pages.injection in messages/*.json, in the reader's language (C19).
  return <RouteError error={error} retry={retry} page="injection" back={{ href: "/staff/compare" }} />;
}
