import type { Metadata } from "next";
import { Suspense } from "react";
import { CopilotPanel } from "@/components/copilot/copilot-panel";
import { LoadingState, Skeleton } from "@/components/loading-skeleton";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Copilot",
  description: "Ask about funding calls, test facilities, events and your own company profile and matches, answered from the Virtual Science Park store with sources.",
};

export default function Page() {
  return (
    <section className="mx-auto flex w-full max-w-3xl min-w-0 flex-1 flex-col gap-4 px-4 py-10">
      <h1 className="text-2xl font-semibold">Copilot</h1>
      <Suspense fallback={<CopilotSkeleton />}>
        <MemberCopilot />
      </Suspense>
    </section>
  );
}

/** Shown while the member's session is checked (C20): the chat's shape. */
function CopilotSkeleton() {
  return (
    <LoadingState label="Loading the Copilot…" className="min-h-[32rem] flex-1 rounded-xl p-4 ring-1 ring-foreground/10">
      <Skeleton className="h-5 w-24" />
      <Skeleton className="h-4 w-full max-w-lg" />
      <Skeleton className="h-28 w-full max-w-md" />
      <div className="mt-auto flex gap-2">
        <Skeleton className="h-8 flex-1" />
        <Skeleton className="h-8 w-16" />
      </div>
    </LoadingState>
  );
}

/** Members only: the chat needs a company to store its turns under. */
async function MemberCopilot() {
  await requireRole("member");
  return <CopilotPanel className="min-h-[32rem] flex-1" />;
}
