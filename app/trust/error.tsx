"use client";

import { RouteError } from "@/components/route-error";
import { useT } from "@/lib/i18n/client";

/** The Trust report (C20). Texts: trust.error in messages/*.json, in the reader's language (C19). */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useT("trust");
  return (
    <RouteError
      error={error}
      retry={retry}
      title={t("error.title")}
      what={t("error.what")}
      back={{ href: "/", label: t("error.back") }}
    />
  );
}
