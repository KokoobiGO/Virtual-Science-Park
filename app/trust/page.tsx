import { Suspense } from "react";
import { redirect } from "next/navigation";
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

export const metadata = { title: "Trust report" };

/** The Trust report (C12): every signed-in user may read it. */
export default function Page() {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Trust report</h1>
        <p className="max-w-prose text-muted-foreground">
          What we have measured about this system, and when. Every number comes from a stored run and carries its date.
          Where nothing has been measured yet, the report says so.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading the measurements...</p>}>
        <Report />
      </Suspense>
    </section>
  );
}

async function Report() {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in?next=/trust");
  const report = await loadTrustReport(viewer);
  return (
    <div className="flex flex-col gap-6">
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
