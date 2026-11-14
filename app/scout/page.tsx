import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { isCachedMode } from "@/lib/collectors/cache";
import { prerunQuestions } from "@/lib/scout/prerun";
import { companySlug, getBrief, isUuid, listBriefs, prerunRows, type Member } from "@/lib/scout/queries";
import { ScoutClient } from "./scout-client";

export const metadata = { title: "Scout" };

/**
 * Scout (C10): ask a question, watch the run, read the cited brief, reopen
 * earlier briefs. The briefs list is the company's saved briefs; an option
 * from the opportunity store can also be saved on its own (saved_items).
 */
export default function Page(props: PageProps<"/scout">) {
  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10">
      <div className="flex max-w-3xl flex-col gap-2">
        <h1 className="text-2xl font-semibold">Scout</h1>
        <p className="text-muted-foreground">
          Ask about funding, test facilities or events. Scout searches Blue Science Park&apos;s store of current opportunities,
          reads the pages it needs and writes a short brief in which every option cites its source. Each option is a potential
          match for you to check: whether you may take part is for the funder or the facility to decide.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading your briefs…</p>}>
        <ScoutScreen searchParams={props.searchParams} />
      </Suspense>
    </section>
  );
}

async function ScoutScreen({ searchParams }: { searchParams: PageProps<"/scout">["searchParams"] }) {
  const viewer = await requireRole("member");
  if (!viewer.companyId) redirect("/");
  const member: Member = { claims: viewer.claims, userId: viewer.userId, companyId: viewer.companyId };

  const [params, briefs, slug, prerun] = await Promise.all([searchParams, listBriefs(member), companySlug(member), prerunRows(member)]);
  const asked = typeof params.brief === "string" && isUuid(params.brief) ? params.brief : null;
  const openId = asked ?? briefs[0]?.id ?? null;
  const initialBrief = openId ? await getBrief(member, openId) : null;
  const suggestions = [...new Set([...prerun.map((p) => p.question), ...(slug ? prerunQuestions(slug) : [])])];

  return <ScoutClient initialBriefs={briefs} initialBrief={initialBrief} suggestions={suggestions} cachedMode={isCachedMode()} />;
}
