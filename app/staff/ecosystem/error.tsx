"use client";

import { RouteError } from "@/components/route-error";

/** The ecosystem map (C20). */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <RouteError
      error={error}
      retry={retry}
      title="The ecosystem map could not be loaded"
      what="Something went wrong on our side while reading the stored connections."
      back={{ href: "/staff/compare", label: "Go to Compare" }}
    />
  );
}
