"use client";

import { RouteError } from "@/components/route-error";

/** The profile pages, their editor and the staff company list (C20). */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  // Texts: errors.pages.profile in messages/*.json, in the reader's language (C19).
  return <RouteError error={error} retry={retry} page="profile" back={{ href: "/" }} />;
}
