import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ListSkeleton, PageShellSkeleton } from "@/components/loading-skeleton";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/auth";
import { BSP_CONTACT } from "@/lib/copilot/policy";
import { companies, handoffs } from "@/lib/db/schema";
import { withUserDb } from "@/lib/db/user";
import type { Locale } from "@/lib/i18n/config";
import { formatDateTime } from "@/lib/i18n/format";
import { getLocale, getT } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/translate";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("handoffs"))("title") };
}

/** Words in the reader's language (C19); the member's question, the topic and the Copilot's answer are shown as stored. */
export default function Page() {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
      <Suspense fallback={<PageShellSkeleton />}>
        <HandoffsFrame />
      </Suspense>
    </section>
  );
}

async function HandoffsFrame() {
  const locale = await getLocale();
  const t = createTranslator(locale, "handoffs");
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-title">{t("title")}</h1>
        <p className="text-muted-foreground">{t("intro")}</p>
        <p className="text-sm text-muted-foreground">
          {t.rich("contact", { contact: <code className="break-all">{BSP_CONTACT}</code> })}
        </p>
      </div>
      <Suspense fallback={<ListSkeleton label={t("loading")} rows={3} rowClassName="h-16" />}>
        <HandoffList locale={locale} />
      </Suspense>
    </>
  );
}

/** A short text from the handoff's context, when it has one. */
const contextText = (context: unknown, key: "answer" | "question"): string | null => {
  const value = context && typeof context === "object" ? (context as Record<string, unknown>)[key] : null;
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

async function HandoffList({ locale }: { locale: Locale }) {
  const viewer = await requireRole("staff");
  const t = createTranslator(locale, "handoffs");
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
    return <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => {
        const answer = contextText(row.context, "answer");
        return (
          <li key={row.id} className="flex flex-col gap-2 rounded-lg border px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={row.status === "open" ? "default" : "secondary"}>{row.status === "open" ? t("open") : t("closed")}</Badge>
              <h2 className="font-medium break-words">{row.company}</h2>
              <span className="text-sm break-words text-muted-foreground">· {row.topic}</span>
              <time dateTime={row.createdAt.toISOString()} className="ml-auto text-sm text-muted-foreground">
                {formatDateTime(row.createdAt, locale)}
              </time>
            </div>
            <p className="text-sm break-words whitespace-pre-wrap">{row.message}</p>
            {answer && (
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground">{t("answer")}</summary>
                <p className="mt-1 break-words whitespace-pre-wrap text-muted-foreground">{answer}</p>
              </details>
            )}
            <p className="text-xs break-all text-muted-foreground">{t("route", { route: row.contactRoute })}</p>
          </li>
        );
      })}
    </ul>
  );
}
