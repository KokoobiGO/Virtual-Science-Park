import Form from "next/form";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clearFiltersHref, DUE_OPTIONS, filtersToQuery, KIND_LABELS, type ExploreFilters } from "@/lib/explore/filter";
import { OpportunityKind, OpportunityTag } from "@/lib/schemas";

const SELECT_CLASS =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

/**
 * The filters as a GET form, so the URL holds them and a filtered list can be
 * shared. The timeline picks its own kinds and dates, and the map shows only
 * test facilities, so those two views only offer the search and the tag; the
 * other two are carried along unchanged.
 */
export function FilterForm({ filters }: { filters: ExploreFilters }) {
  const searchAndTagOnly = filters.view !== "list";
  return (
    <Form
      action="/explore"
      // A new key when the filters change, so the fields show the URL's values after a link click.
      key={filtersToQuery(filters)}
      className={`grid items-end gap-3 rounded-xl border p-4 sm:grid-cols-2 ${searchAndTagOnly ? "lg:grid-cols-[2fr_1fr_auto]" : "lg:grid-cols-[2fr_1fr_1fr_1fr_auto]"}`}
    >
      {searchAndTagOnly ? (
        <>
          <input type="hidden" name="view" value={filters.view} />
          {filters.kind ? <input type="hidden" name="kind" value={filters.kind} /> : null}
          {filters.due ? <input type="hidden" name="due" value={filters.due} /> : null}
        </>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="explore-q">Search titles</Label>
        <Input id="explore-q" name="q" type="search" defaultValue={filters.q} placeholder="For example: offshore wind" />
      </div>

      {searchAndTagOnly ? null : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="explore-kind">Kind</Label>
          <select id="explore-kind" name="kind" defaultValue={filters.kind ?? ""} className={SELECT_CLASS}>
            <option value="">All kinds</option>
            {OpportunityKind.options.map((kind) => (
              <option key={kind} value={kind}>
                {KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="explore-tag">Tag</Label>
        <select id="explore-tag" name="tag" defaultValue={filters.tag ?? ""} className={SELECT_CLASS}>
          <option value="">All tags</option>
          {OpportunityTag.options.map((tag) => (
            <option key={tag} value={tag}>
              {tag === "ai" ? "AI" : tag.charAt(0).toUpperCase() + tag.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {searchAndTagOnly ? null : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="explore-due">Deadline</Label>
          <select id="explore-due" name="due" defaultValue={filters.due ?? ""} className={SELECT_CLASS}>
            <option value="">Any date</option>
            {Object.entries(DUE_OPTIONS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex gap-2">
        <Button type="submit">Filter</Button>
        {/* "Clear", not "Clear filters": e2e/member.spec.ts finds the submit button by the name "Filter" without exact matching. */}
        <Button variant="ghost" nativeButton={false} render={<Link href={clearFiltersHref(filters)} />}>
          Clear
        </Button>
      </div>
    </Form>
  );
}

/** The three views, as links that keep the filters. */
export function ViewTabs({ filters }: { filters: ExploreFilters }) {
  const tabs = [
    { view: "list", label: "List" },
    { view: "timeline", label: "Deadline timeline" },
    { view: "map", label: "Map" },
  ] as const;
  return (
    <nav aria-label="View" className="flex gap-1 border-b">
      {tabs.map((tab) => {
        const current = filters.view === tab.view;
        return (
          <Link
            key={tab.view}
            href={`/explore${filtersToQuery(filters, { view: tab.view })}`}
            aria-current={current ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${current ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
