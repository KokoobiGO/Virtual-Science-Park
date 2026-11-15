import { X } from "lucide-react";
import Form from "next/form";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clearFiltersHref, DUE_OPTIONS, filtersToQuery, SOON_DAYS, type Due, type ExploreFilters } from "@/lib/explore/filter";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { createTranslator } from "@/lib/i18n/translate";
import { OpportunityKind, OpportunityTag } from "@/lib/schemas";
import { tagName } from "./labels";

const SELECT_CLASS =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";
/** A select's column: half the row on a phone, its own width from a tablet up. */
const FIELD_CLASS = "flex min-w-0 flex-[1_1_8rem] flex-col gap-1.5 sm:flex-none sm:w-40";
const LABEL_CLASS = "text-xs font-normal text-muted-foreground";

/**
 * The filters as one compact GET form row, so the URL holds them and a
 * filtered list can be shared. The timeline picks its own kinds and dates, and
 * the map shows only test facilities, so those two views only offer the
 * search and the tag; the other two are carried along unchanged. Words in the
 * reader's language (C19); the values sent stay English.
 */
export function FilterForm({ filters, locale = DEFAULT_LOCALE }: { filters: ExploreFilters; locale?: Locale }) {
  const t = createTranslator(locale, "explore");
  const tc = createTranslator(locale, "common");
  const searchAndTagOnly = filters.view !== "list";
  return (
    <div className="flex flex-col gap-3">
      <Form
        action="/explore"
        // A new key when the filters change, so the fields show the URL's values after a link click.
        key={filtersToQuery(filters)}
        className="flex flex-wrap items-end gap-x-3 gap-y-2"
      >
        {searchAndTagOnly ? (
          <>
            <input type="hidden" name="view" value={filters.view} />
            {filters.kind ? <input type="hidden" name="kind" value={filters.kind} /> : null}
            {filters.due ? <input type="hidden" name="due" value={filters.due} /> : null}
          </>
        ) : null}

        <div className="flex w-full min-w-0 flex-col gap-1.5 sm:w-auto sm:min-w-56 sm:flex-1">
          <Label htmlFor="explore-q" className={LABEL_CLASS}>
            {t("filters.search")}
          </Label>
          <Input id="explore-q" name="q" type="search" defaultValue={filters.q} placeholder={t("filters.searchPlaceholder")} />
        </div>

        {searchAndTagOnly ? null : (
          <div className={FIELD_CLASS}>
            <Label htmlFor="explore-kind" className={LABEL_CLASS}>
              {t("filters.kind")}
            </Label>
            <select id="explore-kind" name="kind" defaultValue={filters.kind ?? ""} className={SELECT_CLASS}>
              <option value="">{t("filters.allKinds")}</option>
              {OpportunityKind.options.map((kind) => (
                <option key={kind} value={kind}>
                  {tc(`kinds.${kind}`)}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className={FIELD_CLASS}>
          <Label htmlFor="explore-tag" className={LABEL_CLASS}>
            {t("filters.tag")}
          </Label>
          <select id="explore-tag" name="tag" defaultValue={filters.tag ?? ""} className={SELECT_CLASS}>
            <option value="">{t("filters.allTags")}</option>
            {OpportunityTag.options.map((tag) => (
              <option key={tag} value={tag}>
                {tagName(tag, locale)}
              </option>
            ))}
          </select>
        </div>

        {searchAndTagOnly ? null : (
          <div className={FIELD_CLASS}>
            <Label htmlFor="explore-due" className={LABEL_CLASS}>
              {t("filters.deadline")}
            </Label>
            <select id="explore-due" name="due" defaultValue={filters.due ?? ""} className={SELECT_CLASS}>
              <option value="">{t("filters.anyDate")}</option>
              {(Object.keys(DUE_OPTIONS) as Due[]).map((value) => (
                <option key={value} value={value}>
                  {t(`due.${value}`, { days: SOON_DAYS })}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex gap-1">
          <Button type="submit">{t("filters.submit")}</Button>
          {/* "Clear", not "Clear filters": e2e/member.spec.ts finds the submit button by the name "Filter" without exact matching. */}
          <Button variant="ghost" nativeButton={false} render={<Link href={clearFiltersHref(filters)} />}>
            {t("filters.clear")}
          </Button>
        </div>
      </Form>
      <ActiveFilters filters={filters} locale={locale} />
    </div>
  );
}

/** One removable chip per filter that narrows this view, so the reader sees what is applied and can drop one with a click. */
function ActiveFilters({ filters, locale }: { filters: ExploreFilters; locale: Locale }) {
  const t = createTranslator(locale, "explore");
  const tc = createTranslator(locale, "common");
  const listOnly = filters.view === "list";
  // The accessible name holds only the value ("Remove filter: Open now"), never the field's label, so getByLabel("Deadline") still finds just the field.
  const chips: { key: string; name: string; value: string; href: string }[] = [];
  const href = (changes: Partial<ExploreFilters>) => `/explore${filtersToQuery(filters, changes)}`;
  if (filters.q) chips.push({ key: "q", name: t("filters.search"), value: filters.q, href: href({ q: "" }) });
  if (listOnly && filters.kind) chips.push({ key: "kind", name: t("filters.kind"), value: tc(`kinds.${filters.kind}`), href: href({ kind: null }) });
  if (filters.tag) chips.push({ key: "tag", name: t("filters.tag"), value: tagName(filters.tag, locale), href: href({ tag: null }) });
  if (listOnly && filters.due) chips.push({ key: "due", name: t("filters.deadline"), value: t(`due.${filters.due}`, { days: SOON_DAYS }), href: href({ due: null }) });
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs animate-fade">
      <span className="text-muted-foreground">{t("filters.active")}:</span>
      <ul className="contents">
        {chips.map((chip) => (
          <li key={chip.key} className="animate-pop">
            <Link
              href={chip.href}
              aria-label={t("filters.remove", { value: chip.value })}
              className="press inline-flex max-w-full items-center gap-1 rounded-full border py-0.5 pr-1.5 pl-2.5 text-xs transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span className="break-all">{t("filters.chip", { name: chip.name, value: chip.value })}</span>
              <X aria-hidden className="size-3.5 shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The three views as a small segmented control of links that keep the filters. */
export function ViewTabs({ filters, locale = DEFAULT_LOCALE }: { filters: ExploreFilters; locale?: Locale }) {
  const t = createTranslator(locale, "explore");
  const views = ["list", "timeline", "map"] as const;
  return (
    <nav aria-label={t("views.label")} className="max-w-full self-start overflow-x-auto">
      <div className="inline-flex gap-0.5 rounded-full border p-0.5">
        {views.map((view) => {
          const current = filters.view === view;
          return (
            <Link
              key={view}
              href={`/explore${filtersToQuery(filters, { view })}`}
              aria-current={current ? "page" : undefined}
              className={`shrink-0 rounded-full px-3 py-1 text-sm whitespace-nowrap transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${current ? "bg-foreground font-medium text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            >
              {t(`views.${view}`)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
