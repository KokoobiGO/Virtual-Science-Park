"use client";

import { RouteError } from "@/components/route-error";
import { useT } from "@/lib/i18n/client";

/** The full-page Copilot (C20). Texts: copilot.error in messages/*.json, in the reader's language (C19). */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useT("copilot");
  return (
    <RouteError
      error={error}
      retry={retry}
      title={t("error.title")}
      what={t("error.what")}
      back={{ href: "/week", label: t("error.back") }}
    />
  );
}
