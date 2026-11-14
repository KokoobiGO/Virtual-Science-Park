"use client";

import { RouteError } from "@/components/route-error";

/** Service checks (C20). */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <RouteError
      error={error}
      retry={retry}
      title="The service checks could not be loaded"
      what="Something went wrong on our side while opening this page."
      back={{ href: "/staff/compare", label: "Go to Compare" }}
    />
  );
}
