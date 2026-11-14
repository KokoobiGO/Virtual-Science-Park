import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LoadingState, Skeleton } from "@/components/loading-skeleton";
import { getViewer } from "@/lib/auth";
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

export const metadata: Metadata = {
  title: "Trust report",
  description: "What has been measured about the Virtual Science Park, and when: profile accuracy, quotes, links, sources, matching and red-team tests.",
};

/** The Trust report (C12): every signed-in user may read it. */
export default function Page() {
  return (
    <section className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Trust report</h1>
        <p className="max-w-prose text-muted-foreground">
          What we have measured about this system, and when. Every number comes from a stored run and carries its date.
          Where nothing has been measured yet, the report says so.
        </p>
      </div>
      <Suspense fallback={<TrustSkeleton />}>
        <Report />
      </Suspense>
    </section>
  );
}

/** Shown while the runs load (C20): one card shape per section. */
function TrustSkeleton() {
  return (
    <LoadingState label="Loading the measurements…" className="gap-6">
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

async function Report() {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in?next=/trust");
  const report = await loadTrustReport(viewer);
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <ProfileAccuracySection run={report.profileAccuracy} />
      <QuoteCheckSection run={report.quoteCheck} />
      <LinkHealthSection run={report.linkCheck} />
      <SourceStatusSection sources={report.sources} />
      <MatchingSection matching={report.matching} />
      <RedTeamSection run={report.redTeam} />
      <PrivacySection run={report.privacy} />
      <TimedTestSection result={report.timedTest} />
      <StaffSessionSection result={report.staffSession} />
      <KnownLimitsSection />
    </div>
  );
}
