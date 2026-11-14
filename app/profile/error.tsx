"use client";

import { RouteError } from "@/components/route-error";

/** The profile pages, their editor and the staff company list (C20). */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <RouteError
      error={error}
      retry={retry}
      title="The company profile could not be loaded"
      what="Something went wrong on our side while reading the profile. Nothing you saved is lost."
      back={{ href: "/", label: "Go to the start page" }}
    />
  );
}
