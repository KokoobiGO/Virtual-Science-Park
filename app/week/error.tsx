"use client";

import { RouteError } from "@/components/route-error";

/** The Your-week cards (C20). */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <RouteError
      error={error}
      retry={retry}
      title="Your cards could not be loaded"
      what="Something went wrong on our side while reading this week's cards. What you saved and the feedback you gave are not lost."
      back={{ href: "/explore", label: "Explore opportunities" }}
    />
  );
}
