import { Suspense } from "react";
import { CopilotPanel } from "@/components/copilot/copilot-panel";
import { requireRole } from "@/lib/auth";

export const metadata = { title: "Copilot" };

export default function Page() {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-10">
      <h1 className="text-2xl font-semibold">Copilot</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <MemberCopilot />
      </Suspense>
    </section>
  );
}

/** Members only: the chat needs a company to store its turns under. */
async function MemberCopilot() {
  await requireRole("member");
  return <CopilotPanel className="min-h-[32rem] flex-1" />;
}
