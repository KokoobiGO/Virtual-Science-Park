"use client";

import { RouteError } from "@/components/route-error";

/** The full-page Copilot (C20). */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <RouteError
      error={error}
      retry={retry}
      title="The Copilot could not be loaded"
      what="Something went wrong on our side while opening the chat."
      back={{ href: "/week", label: "Go to Your week" }}
    />
  );
}
