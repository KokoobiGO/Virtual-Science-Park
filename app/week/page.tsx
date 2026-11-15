import { eq } from "drizzle-orm";
import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { DataStatusLabel } from "@/components/data-status-label";
import { LoadingState, PageShellSkeleton, Skeleton } from "@/components/loading-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getViewer } from "@/lib/auth";
import { mondayOf } from "@/lib/cards/week";
import { companies } from "@/lib/db/schema";
import { withUserDb } from "@/lib/db/user";
import { LocaleProvider } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";
import { createTranslator, type MessageKey } from "@/lib/i18n/translate";
import { NAV } from "@/lib/navigation";
import { weekLabel } from "@/lib/week/format";
import { statusJson } from "@/lib/week/live";
import { loadProfileChangedAt, loadWeek } from "@/lib/week/load";
import { WeekCard } from "./week-card";
import { cardAnchor, WeekGlance } from "./week-glance";
import { WeekLive } from "./week-live";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("week"))("title") };
}

/**
 * Your week (C3): the member's cards for this week. Words in the reader's
 * language (C19); titles, the judge's why and next step, and sources as stored.
 */
export default function Page() {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
      <Suspense fallback={<PageShellSkeleton />}>
        <WeekFrame />
      </Suspense>
    </section>
  );
}

/** Reads the language only, then waits for the session and the cards behind a skeleton in that language. */
async function WeekFrame() {
  const locale = await getLocale();
  const t = createTranslator(locale, "week");
  return (
    <LocaleProvider locale={locale}>
      <div className="flex animate-fade flex-col gap-2">
        <h1 className="text-title">{t("title")}</h1>
        <p className="max-w-prose text-muted-foreground">{t("intro")}</p>
        <Legend locale={locale} />
      </div>
      <Suspense fallback={<WeekSkeleton label={t("loading")} />}>
        <WeekContent locale={locale} />
      </Suspense>
    </LocaleProvider>
  );
}

/** A quiet fold-out key to the labels on the cards, closed by default. */
function Legend({ locale }: { locale: Locale }) {
  const t = createTranslator(locale, "week");
  return (
    <details className="group text-sm text-muted-foreground">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-md select-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden className="size-4 transition-transform group-open:rotate-90" />
        {t("legend.title")}
      </summary>
      <dl className="grid animate-slide-down gap-x-4 gap-y-3 pt-3 pl-5 sm:grid-cols-[max-content_1fr]">
        <LegendRow label={<Badge>{t("card.potentialMatch")}</Badge>} text={t("legend.match")} />
        <LegendRow label={<Badge variant="secondary">{t("card.trendNote")}</Badge>} text={t("legend.trend")} />
        <LegendRow label={<Badge variant="warning">{t("card.notOpenYet", { date: "…" })}</Badge>} text={t("legend.notOpen")} />
        <LegendRow
          label={
            <span className="flex flex-wrap gap-1">
              <DataStatusLabel kind="hand_entered" nameOnly locale={locale} />
              <DataStatusLabel kind="simulated" nameOnly locale={locale} />
              <DataStatusLabel kind="cached" nameOnly locale={locale} />
            </span>
          }
          text={t("legend.data")}
        />
      </dl>
    </details>
  );
}

function LegendRow({ label, text }: { label: ReactNode; text: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{text}</dd>
    </>
  );
}

/** Shaped like the week heading and the card list below it (C20). */
function WeekSkeleton({ label }: { label: string }) {
  return (
    <LoadingState label={label}>
      <Skeleton className="h-7 w-56 max-w-full" />
      <div className="flex flex-col gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-4 rounded-xl p-4 ring-1 ring-foreground/10">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-56 max-w-full" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
            <div className="flex flex-wrap gap-2">
              {[0, 1, 2, 3].map((j) => (
                <Skeleton key={j} className="h-7 w-24" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </LoadingState>
  );
}

/** Reads the session and the company's cards, so it streams in behind the Suspense boundary above. */
async function WeekContent({ locale }: { locale: Locale }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in?next=/week");
  if (viewer.role !== "member" || !viewer.companyId) return <StaffNotice locale={locale} />;

  const t = createTranslator(locale, "week");
  const companyId = viewer.companyId;
  const { week, profileChangedAt, companyName } = await withUserDb(viewer.claims, async (tx) => ({
    week: await loadWeek(tx, { companyId, userId: viewer.userId }),
    profileChangedAt: await loadProfileChangedAt(tx, companyId),
    companyName: (await tx.select({ name: companies.name }).from(companies).where(eq(companies.id, companyId)).limit(1))[0]?.name ?? null,
  }));
  const now = new Date();
  // The page polls this and loads the new order once the cards were built again (C8).
  const status = statusJson({ weekOf: week.weekOf, builtAt: week.builtAt, profileChangedAt }, now);
  if (!week.weekOf || !week.cards.length) {
    return <WeekLive companyId={companyId} status={status} items={[]} empty={<NoCards locale={locale} />} />;
  }

  const thisWeek = mondayOf(now);
  const date = weekLabel(week.weekOf, locale);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">
            {companyName ? t("forCompany", { company: companyName, date }) : t("weekOf", { date })}
          </h2>
          {week.weekOf !== thisWeek ? <p className="text-sm text-muted-foreground">{t("olderWeek", { date })}</p> : null}
        </div>
        <WeekGlance cards={week.cards} now={now} locale={locale} />
      </div>
      <WeekLive
        companyId={companyId}
        status={status}
        items={week.cards.map((card) => ({
          key: card.key,
          anchor: cardAnchor(card.key),
          card: <WeekCard card={card} now={now} locale={locale} />,
        }))}
      />
    </div>
  );
}

function NoCards({ locale }: { locale: Locale }) {
  const t = createTranslator(locale, "week");
  return (
    <div className="flex animate-rise flex-col gap-3 py-6">
      <h2 className="text-lg font-semibold">{t("empty.title")}</h2>
      <p className="max-w-prose text-muted-foreground">{t("empty.text")}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" className="press" render={<Link href="/profile" />} nativeButton={false}>
          {t("empty.profile")}
        </Button>
        <Button variant="ghost" size="sm" className="press" render={<Link href="/explore" />} nativeButton={false}>
          {t("empty.explore")}
        </Button>
      </div>
    </div>
  );
}

/** Staff accounts have no company, so there are no cards to show. */
function StaffNotice({ locale }: { locale: Locale }) {
  const t = createTranslator(locale, "week");
  const nav = createTranslator(locale, "nav");
  return (
    <div className="flex animate-rise flex-col gap-3 py-6">
      <h2 className="text-lg font-semibold">{t("staff.title")}</h2>
      <p className="max-w-prose text-muted-foreground">{t("staff.text")}</p>
      <div className="flex flex-wrap gap-2">
        {NAV.staff.map((item) => (
          <Button key={item.href} variant="outline" size="sm" render={<Link href={item.href} />} nativeButton={false}>
            {nav(`${item.id}.label` as MessageKey<"nav">)}
          </Button>
        ))}
      </div>
    </div>
  );
}
