import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ListSkeleton, PageShellSkeleton } from "@/components/loading-skeleton";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/auth";
import { companies, handoffs } from "@/lib/db/schema";
import { withUserDb } from "@/lib/db/user";
import type { Locale } from "@/lib/i18n/config";
import { formatDateTime } from "@/lib/i18n/format";
import { getLocale, getT } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/translate";
import { CircleCheck, CircleDot } from "lucide-react";
import { StaffPageIntro } from "../page-intro";

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
      <StaffPageIntro title={t("title")} intro={t("intro")} />
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
    return <p className="animate-fade text-sm text-muted-foreground">{t("empty")}</p>;
  }

  const open = rows.filter((row) => row.status === "open").length;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{t("counts", { open, count: rows.length })}</p>
      <ul className="flex flex-col divide-y divide-border/60 stagger">
        {rows.map((row) => {
          const answer = contextText(row.context, "answer");
          const isOpen = row.status === "open";
          return (
            <li key={row.id} className="flex flex-col gap-2 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={isOpen ? "info" : "outline"}>
                  {isOpen ? <CircleDot aria-hidden /> : <CircleCheck aria-hidden />}
                  {isOpen ? t("open") : t("closed")}
                </Badge>
                <h2 className="font-medium break-words">{row.company}</h2>
                <span className="text-sm break-words text-muted-foreground">· {row.topic}</span>
                <time dateTime={row.createdAt.toISOString()} className="ml-auto text-sm text-muted-foreground">
                  {formatDateTime(row.createdAt, locale)}
                </time>
              </div>
              <p className="text-sm break-words whitespace-pre-wrap">{row.message}</p>
              {answer && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">{t("answer")}</summary>
                  <p className="mt-1 animate-slide-down break-words whitespace-pre-wrap text-muted-foreground">{answer}</p>
                </details>
              )}
              <p className="text-xs break-all text-muted-foreground">{t("route", { route: row.contactRoute })}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
