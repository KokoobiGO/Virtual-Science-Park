import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState, Skeleton } from "@/components/loading-skeleton";
import { getViewer, requireRole } from "@/lib/auth";
import { isCachedMode } from "@/lib/collectors/cache";
import { prerunQuestions } from "@/lib/scout/prerun";
import { briefQuestion, companySlug, getBrief, isUuid, listBriefs, prerunRows, type Member } from "@/lib/scout/queries";
import { scoutTitle } from "./labels";
import { ScoutClient } from "./scout-client";

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** "Scout", or the open brief's question and "Scout". */
export async function generateMetadata({ searchParams }: PageProps<"/scout">): Promise<Metadata> {
  const id = first((await searchParams).brief);
  if (!id || !isUuid(id)) return { title: scoutTitle(null) };
  const viewer = await getViewer();
  if (viewer?.role !== "member" || !viewer.companyId) return { title: scoutTitle(null) };
  const question = await briefQuestion({ claims: viewer.claims, userId: viewer.userId, companyId: viewer.companyId }, id);
  return { title: scoutTitle(question) };
}

/**
 * Scout (C10): ask a question, watch the run, read the cited brief, reopen
 * earlier briefs. The briefs list is the company's saved briefs; an option
 * from the opportunity store can also be saved on its own (saved_items).
 */
export default function Page(props: PageProps<"/scout">) {
  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10">
      <div className="flex max-w-3xl flex-col gap-2">
        <h1 className="text-title">Scout</h1>
        <p className="text-muted-foreground">
          Ask about funding, test facilities or events. Scout searches Blue Science Park&apos;s store of current opportunities,
          reads the pages it needs and writes a short brief in which every option cites its source. Each option is a potential
          match for you to check: whether you may take part is for the funder or the facility to decide.
        </p>
      </div>
      <Suspense fallback={<ScoutSkeleton />}>
        <ScoutScreen searchParams={props.searchParams} />
      </Suspense>
    </section>
  );
}

/** The question box, a brief and the list of briefs, while they load. */
function ScoutSkeleton() {
  return (
    <LoadingState label="Loading your briefs…">
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
              <div key={i} className="flex flex-col gap-3 rounded-xl p-4 ring-1 ring-foreground/10">
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

async function ScoutScreen({ searchParams }: { searchParams: PageProps<"/scout">["searchParams"] }) {
  const viewer = await requireRole("member");
  if (!viewer.companyId) {
    return (
      <p className="max-w-prose rounded-xl border border-dashed p-6 text-muted-foreground">
        Your account is not linked to a member company yet, so Scout has no profile to search for. Ask BSP staff to link your
        account to your company.
      </p>
    );
  }
  const member: Member = { claims: viewer.claims, userId: viewer.userId, companyId: viewer.companyId };

  const [params, briefs, slug, prerun] = await Promise.all([searchParams, listBriefs(member), companySlug(member), prerunRows(member)]);
  const asked = first(params.brief);
  const openId = (asked && isUuid(asked) ? asked : null) ?? briefs[0]?.id ?? null;
  const initialBrief = openId ? await getBrief(member, openId) : null;
  const suggestions = [...new Set([...prerun.map((p) => p.question), ...(slug ? prerunQuestions(slug) : [])])];

  return <ScoutClient initialBriefs={briefs} initialBrief={initialBrief} suggestions={suggestions} cachedMode={isCachedMode()} />;
}
