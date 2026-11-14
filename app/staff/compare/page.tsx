import type { Metadata } from "next";
import Form from "next/form";
import { Suspense } from "react";
import { DataStatusLabel, itemDataStatus } from "@/components/data-status-label";
import { LoadingState, PageShellSkeleton, Skeleton } from "@/components/loading-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { requireRole } from "@/lib/auth";
import type { Locale } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/translate";
import { parseSlugPair, type CompareItem } from "@/lib/staff-views/compare";
import { listMembers, loadComparison, type CompareSide, type Member } from "@/lib/staff-views/query";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("compare"))("title") };
}

const SELECT_CLASS =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** C9. The words follow the reader's language (C19); member names, titles, sources and the judge's why are shown as stored. */
export default function Page({ searchParams }: PageProps<"/staff/compare">) {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
      <Suspense fallback={<PageShellSkeleton />}>
        <CompareFrame searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function CompareFrame({ searchParams }: Pick<PageProps<"/staff/compare">, "searchParams">) {
  const locale = await getLocale();
  const t = createTranslator(locale, "compare");
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-title">{t("title")}</h1>
        <p className="text-muted-foreground">{t("intro")}</p>
      </div>
      <Suspense fallback={<CompareSkeleton label={t("loading")} />}>
        <Comparison searchParams={searchParams} locale={locale} />
      </Suspense>
    </>
  );
}

function CompareSkeleton({ label }: { label: string }) {
  return (
    <LoadingState label={label} className="gap-6">
      <div className="grid items-end gap-3 rounded-xl border p-4 sm:grid-cols-[1fr_1fr_auto]">
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
        <Skeleton className="h-8 w-24" />
      </div>
    </LoadingState>
  );
}

/** Reads the session and the URL, so it streams in behind the Suspense boundary above. */
async function Comparison({ searchParams, locale }: Pick<PageProps<"/staff/compare">, "searchParams"> & { locale: Locale }) {
  // The proxy already sends members away; this refuses them on the server too.
  const viewer = await requireRole("staff");
  const t = createTranslator(locale, "compare");
  const params = await searchParams;
  const a = first(params.a);
  const b = first(params.b);
  const members = await listMembers(viewer.claims);
  const pair = parseSlugPair(a, b);
  const result = pair.ok ? await loadComparison(viewer.claims, pair.a, pair.b) : null;
  const error = !pair.ok
    ? a || b
      ? t(`errors.${pair.code}`)
      : null
    : result && !result.ok
      ? t("errors.unknown", { slug: result.slug })
      : null;

  if (members.length < 2) {
    return <p className="rounded-xl border border-dashed p-6 text-muted-foreground">{t("tooFew", { count: members.length })}</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <PickForm members={members} a={a ?? ""} b={b ?? ""} error={error} locale={locale} />
      {!pair.ok || !result?.ok ? (
        error ? null : <p className="text-sm text-muted-foreground">{t("pickPrompt")}</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {t("shared", { count: result.comparison.shared.length })}
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <SideCard side={result.comparison.a} locale={locale} />
            <SideCard side={result.comparison.b} locale={locale} />
          </div>
        </>
      )}
    </div>
  );
}

/** A plain GET form: the choice lives in the URL, and the pickers keep it after an error. */
function PickForm({ members, a, b, error, locale }: { members: Member[]; a: string; b: string; error: string | null; locale: Locale }) {
  const t = createTranslator(locale, "compare");
  const errorId = "compare-error";
  const picker = (name: "a" | "b", label: string, value: string) => (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={`compare-${name}`}>{label}</Label>
      <select
        id={`compare-${name}`}
        name={name}
        defaultValue={value}
        required
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={SELECT_CLASS}
      >
        <option value="">{t("choose")}</option>
        {members.map((m) => (
          <option key={m.slug} value={m.slug}>
            {m.name}
          </option>
        ))}
      </select>
    </div>
  );
  return (
    <Form action="/staff/compare" key={`${a}|${b}`} className="flex flex-col gap-3 rounded-xl border p-4">
      <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
        {picker("a", t("first"), a)}
        {picker("b", t("second"), b)}
        <Button type="submit">{t("submit")}</Button>
      </div>
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </Form>
  );
}

function SideCard({ side, locale }: { side: CompareSide; locale: Locale }) {
  const t = createTranslator(locale, "compare");
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>
          <h2 className="text-heading break-words">{side.name}</h2>
        </CardTitle>
        <CardDescription>
          {side.top.length === 0 ? t("side.none") : side.top.length < 5 ? t("side.few", { count: side.top.length }) : t("side.five")}
        </CardDescription>
      </CardHeader>
      {side.top.length ? (
        <CardContent>
          <ol className="flex flex-col divide-y">
            {side.top.map((item) => (
              <CompareRow key={item.opportunityId} item={item} locale={locale} />
            ))}
          </ol>
        </CardContent>
      ) : null}
    </Card>
  );
}

function CompareRow({ item, locale }: { item: CompareItem; locale: Locale }) {
  const t = createTranslator(locale, "compare");
  const common = createTranslator(locale, "common");
  const status = itemDataStatus(item);
  return (
    <li className={`flex gap-3 py-3 first:pt-0 last:pb-0 ${item.inBoth ? "-mx-2 rounded-lg bg-muted px-2" : ""}`} data-in-both={item.inBoth || undefined}>
      <span className="w-5 shrink-0 text-sm font-medium tabular-nums text-muted-foreground" aria-hidden>
        {item.position}.
      </span>
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="secondary">{common(`kinds.${item.kind}`)}</Badge>
          {item.inBoth ? <Badge>{t("inBoth")}</Badge> : null}
          {status ? <DataStatusLabel kind={status} date={item.cachedAt} locale={locale} /> : null}
          <span className="text-muted-foreground">{item.source}</span>
        </div>
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium break-words underline-offset-4 hover:underline"
        >
          {item.title}
          <span className="sr-only">{common("opensInNewTab")}</span>
        </a>
        <p className="text-sm break-words text-muted-foreground">{item.why ?? t("notJudged")}</p>
      </div>
    </li>
  );
}
