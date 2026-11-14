"use client";

import { RouteError } from "@/components/route-error";

/** Scout's question box, briefs and options (C20). */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <RouteError
      error={error}
      retry={retry}
      title="Scout could not be loaded"
      what="Something went wrong on our side while reading your briefs. Your briefs are kept, and a brief that was running goes on."
      back={{ href: "/week", label: "Go to Your week" }}
    />
  );
}
