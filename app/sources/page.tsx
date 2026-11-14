import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { DataStatusLegend, DataStatusPanel, DataStatusPanelSkeleton } from "@/components/data-status-panel";
import { getViewer } from "@/lib/auth";
import { sourceStatus } from "@/lib/db/schema";
import { withUserDb } from "@/lib/db/user";
import { judgeSources } from "@/lib/sources/health";

export const metadata: Metadata = { title: "Data status" };

/** C13: every data source as live, cached (with the date) or hand-entered. For every signed-in user. */
export default function SourcesPage() {
  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-title">Data status</h1>
        <p className="max-w-prose text-muted-foreground">
          Where the funding calls, testbeds, events and news on this site come from, and how fresh each source is.
          Live sources are read every night. When a source cannot be read, the site shows a recorded copy and says
          so, with the date of the copy.
        </p>
      </div>
      <Suspense fallback={<DataStatusPanelSkeleton />}>
        <Sources />
      </Suspense>
      <section aria-labelledby="legend" className="flex flex-col gap-3">
        <h2 id="legend" className="text-heading">
          What the labels mean
        </h2>
        <DataStatusLegend />
      </section>
    </section>
  );
}

async function Sources() {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in?next=/sources");

  // source_status is readable by every signed-in user (drizzle/0002_rls.sql).
  const rows = await withUserDb(viewer.claims, (tx) =>
    tx
      .select({
        source: sourceStatus.source,
        label: sourceStatus.label,
        state: sourceStatus.state,
        lastSuccessAt: sourceStatus.lastSuccessAt,
        cachedAt: sourceStatus.cachedAt,
        itemCount: sourceStatus.itemCount,
        message: sourceStatus.message,
      })
      .from(sourceStatus),
  );
  return <DataStatusPanel entries={judgeSources(rows, new Date())} />;
}
