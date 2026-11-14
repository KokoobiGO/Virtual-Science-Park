import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LoadingState, PageShellSkeleton, Skeleton } from "@/components/loading-skeleton";
import { getViewer } from "@/lib/auth";
import { filterItems, parseFilters } from "@/lib/explore/filter";
import { buildTestbedMap, SOUTHERN_SWEDEN } from "@/lib/explore/map";
import { loadExplore } from "@/lib/explore/query";
import { buildTimeline } from "@/lib/explore/timeline";
import { LocaleProvider } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/translate";
import { ExploreList } from "./explore-list";
import { ExploreMap } from "./explore-map";
import { ExploreTimeline } from "./explore-timeline";
import { FilterForm, ViewTabs } from "./filter-form";

/** Each view has its own title, so a tab or a bookmark says which one it is. In the reader's language (C19). */
export async function generateMetadata({ searchParams }: PageProps<"/explore">): Promise<Metadata> {
  const [t, params] = await Promise.all([getT("explore"), searchParams]);
  return { title: t(`titles.${parseFilters(params).view}`) };
}

/**
 * The opportunity explorer (C14, C15, C16). The words follow the reader's
 * language (C19); titles, sources, descriptions and the judge's why are shown
 * as stored.
 */
export default function Page({ searchParams }: PageProps<"/explore">) {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
      <Suspense fallback={<PageShellSkeleton />}>
        <ExploreFrame searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

/** Reads the language only, then waits for the session and the data behind a skeleton in that language. */
async function ExploreFrame({ searchParams }: Pick<PageProps<"/explore">, "searchParams">) {
  const locale = await getLocale();
  const t = createTranslator(locale, "explore");
  return (
    <LocaleProvider locale={locale}>
      <div className="flex flex-col gap-1">
        <h1 className="text-title">{t("title")}</h1>
        <p className="text-muted-foreground">{t("intro")}</p>
      </div>
      <Suspense fallback={<ExploreSkeleton label={t("loading")} />}>
        <Explorer searchParams={searchParams} locale={locale} />
      </Suspense>
    </LocaleProvider>
  );
}

/** The view tabs, the filter box, the count line and a few rows, while the opportunities load. */
function ExploreSkeleton({ label }: { label: string }) {
  return (
    <LoadingState label={label} className="gap-5">
      <div className="flex gap-1 border-b pb-2">
        <Skeleton className="h-6 w-12" />
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-6 w-12" />
      </div>
      <div className="grid items-end gap-3 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8" />
          </div>
        ))}
        <Skeleton className="h-8 w-36" />
      </div>
      <Skeleton className="h-4 w-48" />
      <div className="flex flex-col divide-y rounded-xl border">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex flex-col gap-2 px-4 py-3">
            <Skeleton className="h-4 w-56 max-w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-full" />
          </div>
        ))}
      </div>
    </LoadingState>
  );
}

/** Reads the session, the URL and the data, so it streams in behind the Suspense boundary above. */
async function Explorer({ searchParams, locale }: Pick<PageProps<"/explore">, "searchParams"> & { locale: Locale }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in?next=/explore");
  const filters = parseFilters(await searchParams);
  const { items, matches } = await loadExplore(viewer);
  const now = new Date();

  return (
    <div className="flex flex-col gap-5">
      <ViewTabs filters={filters} locale={locale} />
      <FilterForm filters={filters} locale={locale} />
      {filters.view === "timeline" ? (
        <ExploreTimeline timeline={buildTimeline(items, filters, now)} matches={matches} filters={filters} now={now} locale={locale} />
      ) : filters.view === "map" ? (
        <ExploreMap map={buildTestbedMap(items, filters, SOUTHERN_SWEDEN, locale)} matches={matches} filters={filters} locale={locale} />
      ) : (
        <ExploreList items={filterItems(items, filters, now)} total={items.length} matches={matches} filters={filters} now={now} locale={locale} />
      )}
    </div>
  );
}
