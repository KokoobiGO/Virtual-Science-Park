"use client";

import { RouteError } from "@/components/route-error";

/** Handoffs (C20). */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <RouteError
      error={error}
      retry={retry}
      title="The handoffs could not be loaded"
      what="Something went wrong on our side while reading the questions members sent."
      back={{ href: "/staff/compare", label: "Go to Compare" }}
    />
  );
}
