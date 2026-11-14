"use client";

import { RouteError } from "@/components/route-error";

/** Any page without an error boundary of its own (C20). */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  return <RouteError error={error} retry={retry} />;
}
