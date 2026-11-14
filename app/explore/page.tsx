import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getViewer } from "@/lib/auth";
import { filterItems, parseFilters } from "@/lib/explore/filter";
import { buildTestbedMap } from "@/lib/explore/map";
import { loadExplore } from "@/lib/explore/query";
import { buildTimeline } from "@/lib/explore/timeline";
import { ExploreList } from "./explore-list";
import { ExploreMap } from "./explore-map";
import { ExploreTimeline } from "./explore-timeline";
import { FilterForm, ViewTabs } from "./filter-form";

export const metadata = { title: "Explore" };

export default function Page({ searchParams }: PageProps<"/explore">) {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Explore</h1>
        <p className="text-muted-foreground">
          Every funding call, test facility, event and news item collected so far, each linked to its source. Filter by
          kind, tag or deadline, or search the titles.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading the opportunities...</p>}>
        <Explorer searchParams={searchParams} />
      </Suspense>
    </section>
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
        <ExploreTimeline timeline={buildTimeline(items, filters, now)} matches={matches} now={now} />
      ) : filters.view === "map" ? (
        <ExploreMap map={buildTestbedMap(items, filters)} matches={matches} filters={filters} />
      ) : (
        <ExploreList items={filterItems(items, filters, now)} total={items.length} matches={matches} now={now} />
      )}
    </div>
  );
}
