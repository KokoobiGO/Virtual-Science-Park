import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LoadingState, Skeleton } from "@/components/loading-skeleton";
import { getViewer } from "@/lib/auth";
import { EXPLORE_VIEW_TITLES, filterItems, parseFilters } from "@/lib/explore/filter";
import { buildTestbedMap } from "@/lib/explore/map";
import { loadExplore } from "@/lib/explore/query";
import { buildTimeline } from "@/lib/explore/timeline";
import { ExploreList } from "./explore-list";
import { ExploreMap } from "./explore-map";
import { ExploreTimeline } from "./explore-timeline";
import { FilterForm, ViewTabs } from "./filter-form";

/** Each view has its own title, so a tab or a bookmark says which one it is. */
export async function generateMetadata({ searchParams }: PageProps<"/explore">): Promise<Metadata> {
  return { title: EXPLORE_VIEW_TITLES[parseFilters(await searchParams).view] };
}

export default function Page({ searchParams }: PageProps<"/explore">) {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-title">Explore</h1>
        <p className="text-muted-foreground">
          Every funding call, test facility, event and news item collected so far, each linked to its source. Filter by
          kind, tag or deadline, or search the titles.
        </p>
      </div>
      <Suspense fallback={<ExploreSkeleton />}>
        <Explorer searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

/** The view tabs, the filter box, the count line and a few rows, while the opportunities load. */
function ExploreSkeleton() {
  return (
    <LoadingState label="Loading the opportunities…" className="gap-5">
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
async function Explorer({ searchParams }: Pick<PageProps<"/explore">, "searchParams">) {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in?next=/explore");
  const filters = parseFilters(await searchParams);
  const { items, matches } = await loadExplore(viewer);
  const now = new Date();

  return (
    <div className="flex flex-col gap-5">
      <ViewTabs filters={filters} />
      <FilterForm filters={filters} />
      {filters.view === "timeline" ? (
        <ExploreTimeline timeline={buildTimeline(items, filters, now)} matches={matches} filters={filters} now={now} />
      ) : filters.view === "map" ? (
        <ExploreMap map={buildTestbedMap(items, filters)} matches={matches} filters={filters} />
      ) : (
        <ExploreList items={filterItems(items, filters, now)} total={items.length} matches={matches} filters={filters} now={now} />
      )}
    </div>
  );
}
