import { ArrowRight, CalendarCheck, FileSearch, Handshake } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { ClaimBadge } from "@/components/claim-badge";
import { PageShellSkeleton, Skeleton } from "@/components/loading-skeleton";
import { Button } from "@/components/ui/button";
import { getViewer } from "@/lib/auth";
import type { Locale } from "@/lib/i18n/config";
import { getLocale } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/translate";
import { HOME, NAV, SHARED_NAV } from "@/lib/navigation";

const STEPS = [
  { id: "profile", badges: true, Icon: FileSearch },
  { id: "week", badges: false, Icon: CalendarCheck },
  { id: "decide", badges: false, Icon: Handshake },
] as const;

/** The start page. Its words follow the reader's language (C19), so they stream in after the static shell. */
export default function StartPage() {
  return (
    <div className="flex flex-col">
      <Suspense fallback={<StartShell />}>
        <StartContent />
      </Suspense>
    </div>
  );
}

/** The static shell: the hero and the three steps as grey blocks. */
function StartShell() {
  return (
    <>
      <section className="border-b bg-card/60">
        <PageShellSkeleton className="mx-auto w-full max-w-6xl gap-5 px-4 py-14 md:py-24" />
      </section>
      <div className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-12 md:grid-cols-3" aria-hidden>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-36 rounded-xl" />
        ))}
      </div>
    </>
  );
}

async function StartContent() {
  const locale = await getLocale();
  const t = createTranslator(locale, "home");
  return (
    <>
      <section className="relative isolate overflow-hidden border-b bg-card/60">
        <HeroBackdrop />
        <div className="stagger mx-auto flex w-full max-w-6xl flex-col items-start gap-5 px-4 py-14 md:py-24">
          <p className="rounded-full bg-secondary px-3 py-1 text-sm font-medium text-secondary-foreground">{t("eyebrow")}</p>
          <h1 className="max-w-3xl text-title text-balance md:text-display">{t("title")}</h1>
          <p className="max-w-prose text-lg text-muted-foreground">{t("intro")}</p>
          <Suspense fallback={<div className="h-11" aria-hidden />}>
            <StartAction locale={locale} />
          </Suspense>
        </div>
      </section>

      <section aria-labelledby="how" className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-12">
        <div className="flex flex-col gap-1">
          <h2 id="how" className="text-heading">
            {t("howTitle")}
          </h2>
          <p className="max-w-prose text-muted-foreground">{t("howIntro")}</p>
        </div>
        <ol className="stagger grid gap-4 md:grid-cols-3">
          {STEPS.map(({ id, badges, Icon }, i) => (
            <li key={id} className="flex flex-col gap-2 rounded-xl bg-card p-5 shadow-card ring-1 ring-foreground/10">
              <span className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden>
                  <Icon className="size-5" />
                </span>
                <span className="text-sm font-medium text-muted-foreground">{t("stepNumber", { n: i + 1 })}</span>
              </span>
              <h3 className="mt-1 font-semibold">{t(`steps.${id}.title`)}</h3>
              <p className="text-sm text-muted-foreground">{t(`steps.${id}.text`)}</p>
              {badges ? (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <ClaimBadge status="stated" locale={locale} />
                  <ClaimBadge status="inferred" locale={locale} />
                  <ClaimBadge status="missing" locale={locale} />
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      <Suspense fallback={null}>
        <YourScreens locale={locale} />
      </Suspense>
    </>
  );
}

async function StartAction({ locale }: { locale: Locale }) {
  const viewer = await getViewer();
  const t = createTranslator(locale, "home");
  if (!viewer) {
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button size="lg" className="h-11 px-5 text-base shadow-sm" render={<Link href="/sign-in" />} nativeButton={false}>
          {createTranslator(locale, "layout")("signIn")}
          <ArrowRight aria-hidden data-icon="inline-end" />
        </Button>
        <p className="text-sm text-muted-foreground">{t("signInHint")}</p>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <Button size="lg" className="h-11 px-5 text-base shadow-sm" render={<Link href={HOME[viewer.role]} />} nativeButton={false}>
        {viewer.role === "staff" ? t("openStaff") : t("openWeek")}
        <ArrowRight aria-hidden data-icon="inline-end" />
      </Button>
    </div>
  );
}

/** Signed in: one card per screen in the viewer's menu. */
async function YourScreens({ locale }: { locale: Locale }) {
  const viewer = await getViewer();
  if (!viewer) return null;
  const t = createTranslator(locale, "home");
  const nav = createTranslator(locale, "nav");
  const items = [...NAV[viewer.role], ...SHARED_NAV];
  return (
    <section aria-labelledby="your-screens" className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 pb-14">
      <div className="flex flex-col gap-1">
        <h2 id="your-screens" className="text-heading">
          {viewer.role === "staff" ? t("staffTools") : t("yourScreens")}
        </h2>
        <p className="max-w-prose text-muted-foreground">{t("yourScreensIntro")}</p>
      </div>
      <ul className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="lift group flex h-full flex-col gap-1 rounded-xl border border-foreground/10 bg-card p-4 shadow-card outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span className="flex items-center justify-between gap-2 font-medium">
                {nav(`${item.id}.label`)}
                <ArrowRight
                  className="size-4 text-muted-foreground transition-[translate,color] duration-200 group-hover:translate-x-1 group-hover:text-primary group-focus-visible:translate-x-1 group-focus-visible:text-primary"
                  aria-hidden
                />
              </span>
              <span className="text-sm text-muted-foreground">{nav(`${item.id}.description`)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Decorative: soft brand-blue light and two waves behind the hero text. */
function HeroBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute -top-32 -right-24 size-[28rem] rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute -bottom-40 left-1/3 size-[22rem] rounded-full bg-secondary/60 blur-3xl" />
      <svg
        viewBox="0 0 400 120"
        preserveAspectRatio="none"
        className="absolute right-0 bottom-0 hidden h-40 w-1/2 text-primary/15 md:block"
        focusable="false"
      >
        <path d="M0 80c40 0 60-30 100-30s60 30 100 30 60-30 100-30 60 30 100 30" fill="none" stroke="currentColor" strokeWidth="3" />
        <path d="M0 105c40 0 60-30 100-30s60 30 100 30 60-30 100-30 60 30 100 30" fill="none" stroke="currentColor" strokeOpacity="0.6" strokeWidth="3" />
      </svg>
    </div>
  );
}
