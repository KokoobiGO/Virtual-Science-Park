import { CalendarRange, ChevronRight, Compass, Hourglass, Info, Lightbulb, MousePointerClick, SearchCheck, ThumbsUp, UserRoundPen, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { DataStatusLabel } from "@/components/data-status-label";
import { LoadingState, PageShellSkeleton, Skeleton } from "@/components/loading-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getViewer } from "@/lib/auth";
import { mondayOf } from "@/lib/cards/week";
import { withUserDb } from "@/lib/db/user";
import { LocaleProvider } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";
import { createTranslator, type MessageKey } from "@/lib/i18n/translate";
import { NAV } from "@/lib/navigation";
import { urgencyText, weekLabel } from "@/lib/week/format";
import { statusJson } from "@/lib/week/live";
import { loadProfileChangedAt, loadWeek } from "@/lib/week/load";
import { WeekCard } from "./week-card";
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
      </div>
      <Guide locale={locale} />
      <Suspense fallback={<WeekSkeleton label={t("loading")} />}>
        <WeekContent locale={locale} />
      </Suspense>
    </LocaleProvider>
  );
}

const STEPS: { key: "read" | "act" | "teach"; icon: LucideIcon }[] = [
  { key: "read", icon: SearchCheck },
  { key: "act", icon: MousePointerClick },
  { key: "teach", icon: ThumbsUp },
];

/** Three steps that say what to do here, and a fold-out key to the labels on the cards. */
function Guide({ locale }: { locale: Locale }) {
  const t = createTranslator(locale, "week");
  return (
    <section aria-labelledby="week-guide" className="flex flex-col gap-3">
      <h2 id="week-guide" className="sr-only">
        {t("guide.title")}
      </h2>
      <ul className="stagger grid gap-2 sm:grid-cols-3 sm:gap-3">
        {STEPS.map(({ key, icon: Icon }, i) => (
          <li key={key} className="flex items-center gap-3 rounded-xl bg-card px-3 py-2 text-sm ring-1 ring-foreground/10 sm:items-start sm:py-3">
            <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Icon className="size-4" />
            </span>
            <div className="flex flex-col gap-0.5">
              <p className="font-medium">
                <span aria-hidden className="text-muted-foreground">
                  {i + 1}.{" "}
                </span>
                {t(`guide.${key}.title`)}
              </p>
              {/* On a phone the step names are enough; the cards are what the reader came for. */}
              <p className="hidden text-muted-foreground sm:block">{t(`guide.${key}.text`)}</p>
            </div>
          </li>
        ))}
      </ul>
      <details className="group rounded-xl text-sm ring-1 ring-foreground/10 open:bg-card">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-3 py-2 font-medium select-none hover:bg-muted [&::-webkit-details-marker]:hidden">
          <Info aria-hidden className="size-4 text-muted-foreground" />
          {t("legend.title")}
          <ChevronRight aria-hidden className="ml-auto size-4 text-muted-foreground transition-transform group-open:rotate-90" />
        </summary>
        <dl className="grid animate-slide-down gap-x-4 gap-y-3 px-3 pt-1 pb-3 sm:grid-cols-[max-content_1fr]">
          <LegendRow label={<Badge>{t("card.potentialMatch")}</Badge>} text={t("legend.match")} />
          <LegendRow label={<Badge variant="secondary">{t("card.trendNote")}</Badge>} text={t("legend.trend")} />
          <LegendRow label={<Badge variant="warning">{t("card.notOpenYet", { date: "…" })}</Badge>} text={t("legend.notOpen")} />
          <LegendRow
            label={
              <Badge variant="warning">
                <Hourglass aria-hidden data-icon="inline-start" />
                {urgencyText("deadline", { level: "soon", days: 3 }, locale)}
              </Badge>
            }
            text={t("legend.deadline")}
          />
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
    </section>
  );
}

function LegendRow({ label, text }: { label: ReactNode; text: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd className="text-muted-foreground">{text}</dd>
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
            <div className="flex flex-wrap gap-1.5">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-20" />
            </div>
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-56 max-w-full" />
            <Skeleton className="h-16 w-full" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3 w-24" />
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
  const { week, profileChangedAt } = await withUserDb(viewer.claims, async (tx) => ({
    week: await loadWeek(tx, { companyId, userId: viewer.userId }),
    profileChangedAt: await loadProfileChangedAt(tx, companyId),
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
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <CalendarRange aria-hidden className="size-5 text-primary" />
            {t("weekOf", { date })}
          </h2>
          <span className="text-sm text-muted-foreground">{t("cardCount", { count: week.cards.length })}</span>
        </div>
        {week.weekOf !== thisWeek ? <p className="text-sm text-muted-foreground">{t("olderWeek", { date })}</p> : null}
      </div>
      <WeekLive
        companyId={companyId}
        status={status}
        items={week.cards.map((card) => ({ key: card.key, card: <WeekCard card={card} now={now} locale={locale} /> }))}
      />
    </div>
  );
}

function NoCards({ locale }: { locale: Locale }) {
  const t = createTranslator(locale, "week");
  return (
    <Card className="animate-rise">
      <CardHeader className="gap-3">
        <span aria-hidden className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Lightbulb className="size-5" />
        </span>
        <CardTitle>
          <h2 className="text-base font-semibold">{t("empty.title")}</h2>
        </CardTitle>
        <CardDescription className="max-w-prose">{t("empty.text")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-sm font-medium">{t("empty.next")}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="press" render={<Link href="/profile" />} nativeButton={false}>
            <UserRoundPen aria-hidden />
            {t("empty.profile")}
          </Button>
          <Button variant="outline" size="sm" className="press" render={<Link href="/explore" />} nativeButton={false}>
            <Compass aria-hidden />
            {t("empty.explore")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Staff accounts have no company, so there are no cards to show. */
function StaffNotice({ locale }: { locale: Locale }) {
  const t = createTranslator(locale, "week");
  const nav = createTranslator(locale, "nav");
  return (
    <Card className="animate-rise">
      <CardHeader>
        <CardTitle>
          <h2 className="text-base font-semibold">{t("staff.title")}</h2>
        </CardTitle>
        <CardDescription>{t("staff.text")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {NAV.staff.map((item) => (
          <Button key={item.href} variant="outline" size="sm" render={<Link href={item.href} />} nativeButton={false}>
            {nav(`${item.id}.label` as MessageKey<"nav">)}
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}
