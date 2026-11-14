"use client";

import { RouteError } from "@/components/route-error";

/** The data status page (C20). */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <RouteError
      error={error}
      retry={retry}
      title="The data status could not be loaded"
      what="Something went wrong on our side while reading the status of each source."
      back={{ href: "/", label: "Go to the start page" }}
    />
  );
}
