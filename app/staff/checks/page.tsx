import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { PageShellSkeleton } from "@/components/loading-skeleton";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/auth";
import { LocaleProvider } from "@/lib/i18n/client";
import { getLocale, getT } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/translate";
import { INNGEST_CHECKS } from "@/lib/inngest-checks";
import { MODEL_CHECKS } from "@/lib/model-checks";
import { RESEND_CHECKS } from "@/lib/resend-checks";
import { VOYAGE_CHECKS } from "@/lib/voyage-checks";
import { StaffPageIntro } from "../page-intro";
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
      <StaffPageIntro title={t("title")} intro={t("intro")} todo={t("todo")} />

      <div className="flex flex-col gap-10 stagger">
        <Section title={t("models.title")} text={t("models.text")}>
          <ServiceChecks endpoint="/api/checks/models" button={t("models.button")} checks={list(MODEL_CHECKS)} />
        </Section>
        <Section title={t("inngest.title")} text={t("inngest.text")}>
          <ServiceChecks endpoint="/api/checks/inngest" button={t("inngest.button")} checks={list(INNGEST_CHECKS)} />
        </Section>
        <Section title={t("voyage.title")} text={t("voyage.text")}>
          <ServiceChecks endpoint="/api/checks/voyage" button={t("voyage.button")} checks={list(VOYAGE_CHECKS)} />
        </Section>
        <Section title={t("resend.title")} text={t("resend.text")}>
          <ServiceChecks endpoint="/api/checks/resend" button={t("resend.button")} checks={list(RESEND_CHECKS)} />
        </Section>
        <Section title={t("fetcherTitle")} text={t("fetcherText")} badge={t("writesData")}>
          <FetchPageForm />
        </Section>
        <Section title={t("importTitle")} text={t("importText")} badge={t("writesData")}>
          <ImportMembersButton />
        </Section>
      </div>
    </LocaleProvider>
  );
}

/** One service: its name, what the check does, and (for the ones that store something) a "writes data" label. */
function Section({ title, text, badge, children }: { title: string; text: string; badge?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-heading">{title}</h2>
        {badge ? <Badge variant="warning">{badge}</Badge> : null}
      </div>
      <p className="text-sm text-muted-foreground">{text}</p>
      {children}
    </section>
  );
}

/** The proxy already keeps other roles out; this checks again on the server. */
async function Gate() {
  await requireRole("staff");
  return null;
}
