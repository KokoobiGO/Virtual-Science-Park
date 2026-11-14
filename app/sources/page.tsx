import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { DataStatusLegend, DataStatusPanel, DataStatusPanelSkeleton } from "@/components/data-status-panel";
import { PageShellSkeleton } from "@/components/loading-skeleton";
import { getViewer } from "@/lib/auth";
import { sourceStatus } from "@/lib/db/schema";
import { withUserDb } from "@/lib/db/user";
import type { Locale } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/translate";
import { judgeSources } from "@/lib/sources/health";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("sources"))("title") };
}

/**
 * C13: every data source as live, cached (with the date) or hand-entered. For every signed-in user.
 * Words in the reader's language (C19); source names and their messages as stored.
 */
export default function SourcesPage() {
  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10">
      <Suspense fallback={<PageShellSkeleton />}>
        <SourcesFrame />
      </Suspense>
    </section>
  );
}

async function SourcesFrame() {
  const locale = await getLocale();
  const t = createTranslator(locale, "sources");
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-title">{t("title")}</h1>
        <p className="max-w-prose text-muted-foreground">{t("intro")}</p>
      </div>
      <Suspense fallback={<DataStatusPanelSkeleton locale={locale} />}>
        <Sources locale={locale} />
      </Suspense>
      <section aria-labelledby="legend" className="flex flex-col gap-3">
        <h2 id="legend" className="text-heading">
          {t("legendTitle")}
        </h2>
        <DataStatusLegend locale={locale} />
      </section>
    </>
  );
}

async function Sources({ locale }: { locale: Locale }) {
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
  return <DataStatusPanel entries={judgeSources(rows, new Date())} locale={locale} />;
}
