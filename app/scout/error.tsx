"use client";

import { RouteError } from "@/components/route-error";
import { useT } from "@/lib/i18n/client";

/** Scout's question box, briefs and options (C20). Texts: scout.error in messages/*.json, in the reader's language (C19). */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useT("scout");
  return (
    <RouteError error={error} retry={retry} title={t("error.title")} what={t("error.what")} back={{ href: "/week", label: t("error.back") }} />
  );
}
