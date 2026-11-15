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
  TrustSummary,
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
      <div className="flex animate-fade flex-col gap-1">
        <h1 className="text-title">{t("title")}</h1>
        <p className="text-muted-foreground">{t("intro")}</p>
      </div>
      <Suspense fallback={<TrustSkeleton label={t("loading")} />}>
        <Report locale={locale} />
      </Suspense>
    </>
  );
}

/** Shown while the runs load (C20): the headline numbers, then one closed row per section. */
function TrustSkeleton({ label }: { label: string }) {
  return (
    <LoadingState label={label} className="gap-10">
      <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-3 w-32 max-w-full" />
          </div>
        ))}
      </div>
      <div className="flex flex-col divide-y border-t">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex justify-between gap-4 py-4">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    </LoadingState>
  );
}

async function Report({ locale }: { locale: Locale }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in?next=/trust");
  const report = await loadTrustReport(viewer);
  return (
    <div className="flex min-w-0 flex-col gap-12">
      <TrustSummary report={report} locale={locale} />
      {/* Every detailed section closed, each showing its title, headline number and date. */}
      <div className="flex min-w-0 stagger flex-col border-t">
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
    </div>
  );
}
