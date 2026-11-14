import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LoadingState, PageShellSkeleton, Skeleton } from "@/components/loading-skeleton";
import { getViewer } from "@/lib/auth";
import type { Locale } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/translate";
import { loadTrustReport } from "@/lib/trust/load";
import {
  KnownLimitsSection,
  LinkHealthSection,
  MatchingSection,
  PrivacySection,
  ProfileAccuracySection,
  QuoteCheckSection,
  RedTeamSection,
  SourceStatusSection,
  StaffSessionSection,
  TimedTestSection,
} from "./sections";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("trust");
  return { title: t("title"), description: t("description") };
}

/**
 * The Trust report (C12): every signed-in user may read it.
 * Words in the reader's language (C19); the measured numbers, source names and staff quotes as stored.
 */
export default function Page() {
  return (
    <section className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-6 px-4 py-10">
      <Suspense fallback={<PageShellSkeleton />}>
        <TrustFrame />
      </Suspense>
    </section>
  );
}

async function TrustFrame() {
  const locale = await getLocale();
  const t = createTranslator(locale, "trust");
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="max-w-prose text-muted-foreground">{t("intro")}</p>
      </div>
      <Suspense fallback={<TrustSkeleton label={t("loading")} />}>
        <Report locale={locale} />
      </Suspense>
    </>
  );
}

/** Shown while the runs load (C20): one card shape per section. */
function TrustSkeleton({ label }: { label: string }) {
  return (
    <LoadingState label={label} className="gap-6">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex flex-col gap-3 rounded-xl p-4 ring-1 ring-foreground/10">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-full max-w-xl" />
          <Skeleton className="h-24" />
        </div>
      ))}
    </LoadingState>
  );
}

async function Report({ locale }: { locale: Locale }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in?next=/trust");
  const report = await loadTrustReport(viewer);
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <ProfileAccuracySection run={report.profileAccuracy} locale={locale} />
      <QuoteCheckSection run={report.quoteCheck} locale={locale} />
      <LinkHealthSection run={report.linkCheck} locale={locale} />
      <SourceStatusSection sources={report.sources} locale={locale} />
      <MatchingSection matching={report.matching} locale={locale} />
      <RedTeamSection run={report.redTeam} locale={locale} />
      <PrivacySection run={report.privacy} locale={locale} />
      <TimedTestSection result={report.timedTest} locale={locale} />
      <StaffSessionSection result={report.staffSession} locale={locale} />
      <KnownLimitsSection locale={locale} />
    </div>
  );
}
