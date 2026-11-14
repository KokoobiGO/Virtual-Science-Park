"use client";

import { RouteError } from "@/components/route-error";

/** Compare members (C20). */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <RouteError
      error={error}
      retry={retry}
      title="The comparison could not be loaded"
      what="Something went wrong on our side while reading the two members' rankings."
      back={{ href: "/staff/compare", label: "Start a new comparison" }}
    />
  );
}
