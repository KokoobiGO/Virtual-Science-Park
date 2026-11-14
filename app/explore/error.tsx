"use client";

import { RouteError } from "@/components/route-error";

/** The explorer's list, timeline and map (C20). */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <RouteError
      error={error}
      retry={retry}
      title="The opportunities could not be loaded"
      what="Something went wrong on our side while reading the funding calls, test facilities and events."
      back={{ href: "/", label: "Go to the start page" }}
    />
  );
}
