import { ArrowRight } from "lucide-react";
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
  { id: "profile", badges: true },
  { id: "week", badges: false },
  { id: "decide", badges: false },
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
        <PageShellSkeleton className="mx-auto w-full max-w-6xl gap-5 px-4 py-14 md:py-20" />
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
      <section className="border-b bg-card/60">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-14 md:py-20">
          <p className="text-sm font-medium text-primary">{t("eyebrow")}</p>
          <h1 className="max-w-3xl text-title md:text-display">{t("title")}</h1>
          <p className="max-w-prose text-lg text-muted-foreground">{t("intro")}</p>
          <Suspense fallback={<div className="h-9" aria-hidden />}>
            <StartAction locale={locale} />
          </Suspense>
        </div>
      </section>

      <section aria-labelledby="how" className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-12">
        <h2 id="how" className="text-heading">
          {t("howTitle")}
        </h2>
        <ol className="grid gap-4 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.id} className="flex flex-col gap-2 rounded-xl bg-card p-5 shadow-card ring-1 ring-foreground/10">
              <span className="flex size-7 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground" aria-hidden>
                {i + 1}
              </span>
              <h3 className="font-semibold">{t(`steps.${step.id}.title`)}</h3>
              <p className="text-sm text-muted-foreground">{t(`steps.${step.id}.text`)}</p>
              {step.badges ? (
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
        <Button size="lg" className="px-4" render={<Link href="/sign-in" />} nativeButton={false}>
          {createTranslator(locale, "layout")("signIn")}
          <ArrowRight aria-hidden data-icon="inline-end" />
        </Button>
        <p className="text-sm text-muted-foreground">{t("signInHint")}</p>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <Button size="lg" className="px-4" render={<Link href={HOME[viewer.role]} />} nativeButton={false}>
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
      <h2 id="your-screens" className="text-heading">
        {viewer.role === "staff" ? t("staffTools") : t("yourScreens")}
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="group flex h-full flex-col gap-1 rounded-xl bg-card p-4 shadow-card ring-1 ring-foreground/10 transition-colors outline-none hover:ring-primary/50 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex items-center justify-between gap-2 font-medium">
                {nav(`${item.id}.label`)}
                <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
              </span>
              <span className="text-sm text-muted-foreground">{nav(`${item.id}.description`)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
