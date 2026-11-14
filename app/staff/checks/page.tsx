import type { Metadata } from "next";
import { Suspense } from "react";
import { PageShellSkeleton } from "@/components/loading-skeleton";
import { requireRole } from "@/lib/auth";
import { LocaleProvider } from "@/lib/i18n/client";
import { getLocale, getT } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/translate";
import { INNGEST_CHECKS } from "@/lib/inngest-checks";
import { NVIDIA_CHECKS } from "@/lib/nvidia-checks";
import { RESEND_CHECKS } from "@/lib/resend-checks";
import { VOYAGE_CHECKS } from "@/lib/voyage-checks";
import { FetchPageForm } from "./fetch-page-form";
import { ImportMembersButton } from "./import-members-button";
import { ServiceChecks } from "./service-checks";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("checks"))("title") };
}

const list = (checks: Record<string, string>) => Object.entries(checks).map(([id, label]) => ({ id, label }));

/**
 * S3. Our words follow the reader's language (C19). The check names (they
 * carry model ids) and the results the services send back are technical and
 * stay as the server writes them.
 */
export default function Page() {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-10">
      <Suspense fallback={<PageShellSkeleton />}>
        <ChecksContent />
      </Suspense>
      <Suspense>
        <Gate />
      </Suspense>
    </section>
  );
}

async function ChecksContent() {
  const locale = await getLocale();
  const t = createTranslator(locale, "checks");
  return (
    <LocaleProvider locale={locale}>
      <div className="flex flex-col gap-1">
        <h1 className="text-title">{t("title")}</h1>
        <p className="text-muted-foreground">{t("intro")}</p>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-heading">{t("nvidia.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("nvidia.text")}</p>
        <ServiceChecks endpoint="/api/checks/nvidia" button={t("nvidia.button")} checks={list(NVIDIA_CHECKS)} />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-heading">{t("inngest.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("inngest.text")}</p>
        <ServiceChecks endpoint="/api/checks/inngest" button={t("inngest.button")} checks={list(INNGEST_CHECKS)} />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-heading">{t("voyage.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("voyage.text")}</p>
        <ServiceChecks endpoint="/api/checks/voyage" button={t("voyage.button")} checks={list(VOYAGE_CHECKS)} />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-heading">{t("resend.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("resend.text")}</p>
        <ServiceChecks endpoint="/api/checks/resend" button={t("resend.button")} checks={list(RESEND_CHECKS)} />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-heading">{t("fetcherTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("fetcherText")}</p>
        <FetchPageForm />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-heading">{t("importTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("importText")}</p>
        <ImportMembersButton />
      </div>
    </LocaleProvider>
  );
}

/** The proxy already keeps other roles out; this checks again on the server. */
async function Gate() {
  await requireRole("staff");
  return null;
}
