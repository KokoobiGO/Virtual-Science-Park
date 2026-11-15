import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState, PageShellSkeleton, Skeleton } from "@/components/loading-skeleton";
import { getViewer, requireRole } from "@/lib/auth";
import { isCachedMode } from "@/lib/collectors/cache";
import { LocaleProvider } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/translate";
import { prerunQuestions } from "@/lib/scout/prerun";
import { briefQuestion, companySlug, getBrief, isUuid, listBriefs, prerunRows, type Member } from "@/lib/scout/queries";
import { scoutTitle } from "./labels";
import { ScoutClient } from "./scout-client";

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** "Scout", or the open brief's question and "Scout". */
export async function generateMetadata({ searchParams }: PageProps<"/scout">): Promise<Metadata> {
  const [t, params] = await Promise.all([getT("scout"), searchParams]);
  const id = first(params.brief);
  if (!id || !isUuid(id)) return { title: scoutTitle(null, t) };
  const viewer = await getViewer();
  if (viewer?.role !== "member" || !viewer.companyId) return { title: scoutTitle(null, t) };
  const question = await briefQuestion({ claims: viewer.claims, userId: viewer.userId, companyId: viewer.companyId }, id);
  return { title: scoutTitle(question, t) };
}

/**
 * Scout (C10): ask a question, watch the run, read the cited brief, reopen
 * earlier briefs. The briefs list is the company's saved briefs; an option
 * from the opportunity store can also be saved on its own (saved_items).
 * The words follow the reader's language (C19); questions and briefs are shown as stored.
 */
export default function Page(props: PageProps<"/scout">) {
  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10">
      <Suspense fallback={<PageShellSkeleton className="max-w-3xl" />}>
        <ScoutFrame searchParams={props.searchParams} />
      </Suspense>
    </section>
  );
}

/** Reads the language only, then waits for the session and the briefs behind a skeleton in that language. */
async function ScoutFrame({ searchParams }: { searchParams: PageProps<"/scout">["searchParams"] }) {
  const locale = await getLocale();
  const t = createTranslator(locale, "scout");
  return (
    <LocaleProvider locale={locale}>
      <div className="flex max-w-3xl animate-fade flex-col gap-2">
        <h1 className="text-title">{t("title")}</h1>
        <p className="text-muted-foreground">{t("intro")}</p>
      </div>
      <Suspense fallback={<ScoutSkeleton label={t("loading")} />}>
        <ScoutScreen searchParams={searchParams} locale={locale} />
      </Suspense>
    </LocaleProvider>
  );
}

/** The question box, a brief and the list of briefs, while they load. */
function ScoutSkeleton({ label }: { label: string }) {
  return (
    <LoadingState label={label}>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-20" />
            <Skeleton className="h-8 w-28" />
          </div>
          <div className="flex flex-col gap-3">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            {[0, 1].map((i) => (
              <div key={i} className="flex flex-col gap-3 py-2">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-16" />
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-24" />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      </div>
    </LoadingState>
  );
}

async function ScoutScreen({ searchParams, locale }: { searchParams: PageProps<"/scout">["searchParams"]; locale: Locale }) {
  const viewer = await requireRole("member");
  if (!viewer.companyId) {
    return <p className="max-w-prose text-muted-foreground">{createTranslator(locale, "scout")("notLinked")}</p>;
  }
  const member: Member = { claims: viewer.claims, userId: viewer.userId, companyId: viewer.companyId };

  const [params, briefs, slug, prerun] = await Promise.all([searchParams, listBriefs(member), companySlug(member), prerunRows(member)]);
  const asked = first(params.brief);
  const openId = (asked && isUuid(asked) ? asked : null) ?? briefs[0]?.id ?? null;
  const initialBrief = openId ? await getBrief(member, openId) : null;
  const suggestions = [...new Set([...prerun.map((p) => p.question), ...(slug ? prerunQuestions(slug) : [])])];

  return <ScoutClient initialBriefs={briefs} initialBrief={initialBrief} suggestions={suggestions} cachedMode={isCachedMode()} />;
}
