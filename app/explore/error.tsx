"use client";

import { RouteError } from "@/components/route-error";
import { useT } from "@/lib/i18n/client";

/** The explorer's list, timeline and map (C20). Texts: explore.error in messages/*.json, in the reader's language (C19). */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useT("explore");
  return (
    <RouteError error={error} retry={retry} title={t("error.title")} what={t("error.what")} back={{ href: "/", label: t("error.back") }} />
  );
}
