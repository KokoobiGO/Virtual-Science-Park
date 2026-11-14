import { desc, eq } from "drizzle-orm";
import { Suspense } from "react";
import { ListSkeleton } from "@/components/loading-skeleton";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/auth";
import { BSP_CONTACT } from "@/lib/copilot/policy";
import { companies, handoffs } from "@/lib/db/schema";
import { withUserDb } from "@/lib/db/user";

export const metadata = { title: "Handoffs" };

export default function Page() {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-title">Handoffs</h1>
        <p className="text-muted-foreground">
          Questions members sent to BSP staff from the Copilot, newest first. Members send these on purpose; their chats
          stay private.
        </p>
        <p className="text-sm text-muted-foreground">
          Contact route on new handoffs: <code className="break-all">{BSP_CONTACT}</code>. This is not a real address
          yet: BSP has not chosen the route.
        </p>
      </div>
      <Suspense fallback={<ListSkeleton label="Loading the handoffs…" rows={3} rowClassName="h-16" />}>
        <HandoffList />
      </Suspense>
    </section>
  );
}

const when = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Stockholm", dateStyle: "medium", timeStyle: "short" });

/** A short text from the handoff's context, when it has one. */
const contextText = (context: unknown, key: "answer" | "question"): string | null => {
  const value = context && typeof context === "object" ? (context as Record<string, unknown>)[key] : null;
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

async function HandoffList() {
  const viewer = await requireRole("staff");
  // On the staff member's own client: the policy handoffs_read lets staff read every handoff.
  const rows = await withUserDb(viewer.claims, (tx) =>
    tx
      .select({
        id: handoffs.id,
        company: companies.name,
        topic: handoffs.topic,
        message: handoffs.message,
        status: handoffs.status,
        contactRoute: handoffs.contactRoute,
        context: handoffs.context,
        createdAt: handoffs.createdAt,
      })
      .from(handoffs)
      .innerJoin(companies, eq(companies.id, handoffs.companyId))
      .orderBy(desc(handoffs.createdAt))
      .limit(100),
  );

  if (!rows.length) {
    return (
      <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
        No handoffs yet. When a member presses &quot;Send to BSP staff&quot; under a Copilot answer, the question appears here.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => {
        const answer = contextText(row.context, "answer");
        return (
          <li key={row.id} className="flex flex-col gap-2 rounded-lg border px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={row.status === "open" ? "default" : "secondary"}>{row.status === "open" ? "Open" : "Closed"}</Badge>
              <h2 className="font-medium break-words">{row.company}</h2>
              <span className="text-sm break-words text-muted-foreground">· {row.topic}</span>
              <time dateTime={row.createdAt.toISOString()} className="ml-auto text-sm text-muted-foreground">
                {when.format(row.createdAt)}
              </time>
            </div>
            <p className="text-sm break-words whitespace-pre-wrap">{row.message}</p>
            {answer && (
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground">The Copilot&apos;s answer</summary>
                <p className="mt-1 break-words whitespace-pre-wrap text-muted-foreground">{answer}</p>
              </details>
            )}
            <p className="text-xs break-all text-muted-foreground">Contact route: {row.contactRoute}</p>
          </li>
        );
      })}
    </ul>
  );
}
