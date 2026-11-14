"use client";

import { RouteError } from "@/components/route-error";

/** The planted instruction test (C20). */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <RouteError
      error={error}
      retry={retry}
      title="The test result could not be loaded"
      what="Something went wrong on our side while reading the last recorded run."
      back={{ href: "/staff/compare", label: "Go to Compare" }}
    />
  );
}
