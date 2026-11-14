"use client";

import { RouteError } from "@/components/route-error";
import { useT } from "@/lib/i18n/client";

/** The Your-week cards (C20), in the reader's language (C19). */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useT("week");
  return <RouteError error={error} retry={retry} title={t("error.title")} what={t("error.what")} back={{ href: "/explore", label: t("error.back") }} />;
}
