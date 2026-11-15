import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { DataStatusLabel, type DataStatusKind } from "@/components/data-status-label";
import { DataStatusPanel, DataStatusPanelSkeleton } from "@/components/data-status-panel";
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
      <div className="flex animate-rise flex-col gap-1">
        <h1 className="text-title">{t("title")}</h1>
        <p className="text-muted-foreground">{t("intro")}</p>
      </div>
      <Suspense fallback={<DataStatusPanelSkeleton locale={locale} />}>
        <div className="animate-fade">
          <Sources locale={locale} />
        </div>
      </Suspense>
      {/* What each label means, closed by default: the labels are words already, so most readers never need it. */}
      <details className="group text-sm">
        <summary className="w-fit cursor-pointer rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          {t("legendTitle")}
        </summary>
        <div className="pt-4">
          <StateMeanings locale={locale} />
        </div>
      </details>
    </>
  );
}

/** Each label, with what it means for the reader in a plain sentence: the label's own text carries the state, never its colour alone. */
function StateMeanings({ locale }: { locale: Locale }) {
  const t = createTranslator(locale, "sources");
  return (
    <dl className="stagger grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
      {STATE_ORDER.map((kind) => (
        <div key={kind} className="flex flex-col items-start gap-1.5">
          <dt>
            <DataStatusLabel kind={kind} nameOnly locale={locale} />
          </dt>
          <dd className="text-muted-foreground">{t(`states.${kind}`)}</dd>
        </div>
      ))}
    </dl>
  );
}

const STATE_ORDER = ["live", "stale", "cached", "hand_entered", "simulated"] as const satisfies readonly DataStatusKind[];

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
