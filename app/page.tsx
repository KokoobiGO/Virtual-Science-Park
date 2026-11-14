import { ArrowRight, ArrowUpRight, CalendarCheck, FileSearch, Handshake } from "lucide-react";
import { cn } from "cn";
import Link from "next/link";
import { Suspense } from "react";
import { ClaimBadge } from "@/components/claim-badge";
import { PageShellSkeleton, Skeleton } from "@/components/loading-skeleton";
import { LiquidOrb } from "@/components/liquid-orb";
import { Button } from "@/components/ui/button";
import { COLLECTORS } from "@/lib/collectors";
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
      <div className="bg-[oklch(0.17_0.03_280)] px-3 py-6 sm:px-8 sm:py-12">
        <section className="mx-auto min-h-[38rem] w-full max-w-6xl rounded-[1.75rem] bg-[oklch(0.16_0.005_280)] md:min-h-[42rem]">
          <PageShellSkeleton className="mx-auto w-full max-w-3xl items-center gap-5 px-4 pt-16 md:pt-20" />
        </section>
      </div>
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
      <div className="dark relative isolate overflow-hidden bg-[radial-gradient(120%_80%_at_20%_0%,oklch(0.3_0.06_295),oklch(0.17_0.03_280)_55%,oklch(0.13_0.02_270))] px-3 py-6 sm:px-8 sm:py-12">
        <Starfield />
        <section className="relative isolate mx-auto flex min-h-[38rem] w-full max-w-6xl flex-col items-center overflow-hidden rounded-[1.75rem] bg-[radial-gradient(90%_70%_at_15%_0%,oklch(0.27_0.03_300),oklch(0.16_0.005_280)_60%,oklch(0.14_0.004_280))] shadow-[0_40px_120px_-40px_black] ring-1 ring-white/10 md:min-h-[42rem]">
          <Starfield faint />
          <div className="stagger relative z-10 flex flex-col items-center gap-5 px-6 pt-16 text-center md:pt-20">
            <h1 className="max-w-[15ch] text-[2.4rem] leading-[1.05] font-medium tracking-[-0.035em] text-balance text-white md:max-w-[24ch] md:text-[3.6rem]">{t("title")}</h1>
            <p className="max-w-sm text-sm leading-relaxed text-white/55">{t("tagline")}</p>
            <Suspense fallback={<div className="h-9" aria-hidden />}>
              <StartAction locale={locale} />
            </Suspense>
          </div>
          <LiquidOrb className="absolute bottom-[-30%] left-1/2 w-[min(36rem,125vw)] -translate-x-1/2 md:bottom-[-26%] md:w-[38rem]" />
          <GlassCard
            className="top-[58%] left-[5%] lg:left-[13%]"
            label={t("cards.evidence.label")}
            title={t("cards.evidence.value")}
            aside={t("cards.evidence.text")}
          />
          <GlassCard
            className="top-[68%] right-[5%] [animation-delay:-3.5s] lg:right-[13%]"
            label={t("cards.sources.label")}
            value={t("cards.sources.value", { count: COLLECTORS.length })}
            bar
          />
        </section>
      </div>

      <section id="how-it-works" aria-labelledby="how" className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-12">
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
      <Button className={PILL_PRIMARY} render={<Link href="/sign-in" />} nativeButton={false}>
        {createTranslator(locale, "layout")("signIn")}
        <ArrowRight aria-hidden data-icon="inline-end" />
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <Button className={PILL_PRIMARY} render={<Link href={HOME[viewer.role]} />} nativeButton={false}>
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

const PILL_PRIMARY = "h-9 rounded-full bg-white px-4 text-sm font-medium text-neutral-900 shadow-[0_8px_30px_-10px_white] hover:bg-white/90";

/** Decorative: tiny stars that twinkle slowly. */
function Starfield({ faint = false }: { faint?: boolean }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 -z-10", faint ? "opacity-50" : "")}>
      <div className="animate-twinkle absolute inset-0 bg-[radial-gradient(1px_1px_at_20px_30px,white,transparent),radial-gradient(1px_1px_at_140px_90px,white,transparent),radial-gradient(1.5px_1.5px_at_230px_170px,white,transparent),radial-gradient(1px_1px_at_70px_210px,white,transparent)] bg-[length:300px_260px] opacity-50" />
      <div className="animate-twinkle absolute inset-0 bg-[radial-gradient(1px_1px_at_90px_40px,white,transparent),radial-gradient(1.5px_1.5px_at_10px_150px,white,transparent),radial-gradient(1px_1px_at_190px_230px,white,transparent)] bg-[length:380px_320px] opacity-35 [animation-delay:-2.5s]" />
    </div>
  );
}

/** A small frosted card floating over the hero, with one fact about the service. */
function GlassCard({ className, label, title, value, aside, bar = false }: { className?: string; label: string; title?: string; value?: string; aside?: string; bar?: boolean }) {
  return (
    <div
      className={cn(
        "animate-float absolute z-10 hidden w-48 flex-col gap-1.5 rounded-xl border border-white/10 bg-white/[0.05] p-3 text-left shadow-[0_20px_50px_-20px_black] backdrop-blur-md md:flex",
        className,
      )}
    >
      <span className="flex items-center justify-between text-[11px] text-white/55">
        {label}
        <span className="flex size-5 items-center justify-center rounded-full bg-white text-neutral-900" aria-hidden>
          <ArrowUpRight className="size-3" />
        </span>
      </span>
      {title ? (
        <span className="flex items-end justify-between gap-2">
          <span className="text-sm leading-tight font-medium text-white">{title}</span>
          {aside ? <span className="shrink-0 text-[10px] text-white/40">{aside}</span> : null}
        </span>
      ) : null}
      {value ? <span className="text-xl font-semibold tracking-tight text-white">{value}</span> : null}
      {bar ? <span aria-hidden className="mt-1 h-0.5 w-3/5 rounded-full bg-white/90" /> : null}
    </div>
  );
}
