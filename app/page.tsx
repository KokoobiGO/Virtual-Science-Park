import { ArrowRight, ArrowUpRight, CalendarCheck, FileSearch, Handshake } from "lucide-react";
import { cn } from "cn";
import Link from "next/link";
import { Suspense } from "react";
import { ClaimBadge } from "@/components/claim-badge";
import { SpotCard, Spotlight } from "@/components/landing/spotlight";
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

/**
 * The start page: one continuous dark surface (the site header and footer join
 * it through [data-landing] in globals.css). Its words follow the reader's
 * language (C19), so they stream in after the static shell.
 */
export default function StartPage() {
  return (
    <div data-landing className="dark flex flex-1 flex-col bg-[oklch(0.14_0.004_280)] text-foreground">
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
      <section className="min-h-[44rem] w-full md:min-h-[50rem]">
        <PageShellSkeleton className="mx-auto w-full max-w-3xl items-center gap-5 px-4 pt-36 md:pt-44" />
      </section>
      <div className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-12 md:grid-cols-3" aria-hidden>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-36 rounded-2xl" />
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
      <section className="relative isolate flex min-h-[44rem] w-full flex-col items-center overflow-hidden bg-[radial-gradient(60%_55%_at_12%_0%,oklch(0.3_0.03_320/0.85),transparent),radial-gradient(50%_45%_at_95%_10%,oklch(0.28_0.05_260/0.55),transparent)] md:min-h-[50rem]">
        <Starfield />
        <div className="stagger relative z-10 flex flex-col items-center gap-5 px-6 pt-36 text-center md:pt-44">
          <h1 className="max-w-[15ch] text-[2.4rem] leading-[1.05] font-medium tracking-[-0.035em] text-balance text-white md:max-w-[24ch] md:text-[3.8rem]">
            {t("title")}
          </h1>
          <p className="max-w-sm text-sm leading-relaxed text-white/55">{t("tagline")}</p>
          <Suspense fallback={<div className="h-9" aria-hidden />}>
            <StartAction locale={locale} />
          </Suspense>
        </div>
        <LiquidOrb className="absolute bottom-[-24%] left-1/2 w-[min(36rem,125vw)] -translate-x-1/2 md:bottom-[-28%] md:w-[46rem]" />
        <GlassCard
          className="top-[60%] left-[6%] lg:left-[16%]"
          label={t("cards.evidence.label")}
          title={t("cards.evidence.value")}
          aside={t("cards.evidence.text")}
        />
        <GlassCard
          className="top-[69%] right-[6%] [animation-delay:-3.5s] lg:right-[16%]"
          label={t("cards.sources.label")}
          value={t("cards.sources.value", { count: COLLECTORS.length })}
          bar
        />
        {/* The hero melts into the page below. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] h-56 bg-gradient-to-b from-transparent to-[oklch(0.14_0.004_280)]" />
      </section>

      <SourceTicker label={t("cards.sources.label")} live={t("live")} />

      <section id="how-it-works" aria-labelledby="how" className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-24">
        <div className="reveal flex flex-col items-center gap-2 text-center">
          <h2 id="how" className="text-3xl font-medium tracking-[-0.02em] text-white md:text-4xl">
            {t("howTitle")}
          </h2>
          <p className="max-w-prose text-white/55">{t("howIntro")}</p>
        </div>
        <Spotlight className="relative">
          {/* A beam of light runs through the three steps. */}
          <span aria-hidden className="landing-beam absolute top-[2.85rem] right-[18%] left-[18%] hidden h-px md:block" />
          <ol className="relative grid gap-4 md:grid-cols-3">
            {STEPS.map(({ id, badges, Icon }, i) => (
              <li key={id} className="reveal">
                <SpotCard className="h-full" innerClassName="flex flex-col gap-2 p-6">
                  <span className="flex items-center gap-3">
                    <span className="relative flex size-11 items-center justify-center rounded-xl bg-white/[0.06] text-white ring-1 ring-white/10" aria-hidden>
                      <Icon className="size-5" />
                      <span className="absolute -top-1 -right-1 flex size-2.5">
                        <span
                          className="absolute inline-flex size-full animate-ping rounded-full bg-[oklch(0.8_0.13_215)] opacity-60 motion-reduce:animate-none"
                          style={{ animationDelay: `${i * 0.6}s` }}
                        />
                        <span className="relative inline-flex size-2.5 rounded-full bg-[oklch(0.8_0.13_215)]" />
                      </span>
                    </span>
                    <span className="text-sm font-medium text-white/45">{t("stepNumber", { n: i + 1 })}</span>
                  </span>
                  <h3 className="mt-2 text-lg font-medium text-white">{t(`steps.${id}.title`)}</h3>
                  <p className="text-sm leading-relaxed text-white/55">{t(`steps.${id}.text`)}</p>
                  {badges ? (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <ClaimBadge status="stated" locale={locale} />
                      <ClaimBadge status="inferred" locale={locale} />
                      <ClaimBadge status="missing" locale={locale} />
                    </div>
                  ) : null}
                </SpotCard>
              </li>
            ))}
          </ol>
        </Spotlight>
      </section>

      <Suspense fallback={null}>
        <YourScreens locale={locale} />
      </Suspense>
    </>
  );
}

/** Every source the collectors read, sliding past slowly, with a live dot. */
function SourceTicker({ label, live }: { label: string; live: string }) {
  const names = COLLECTORS.map((c) => c.label);
  return (
    <section aria-label={label} className="relative z-10 border-y border-white/[0.06] bg-white/[0.015] py-4">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-5 px-4">
        <span className="flex shrink-0 items-center gap-2 text-xs font-medium tracking-wide text-white/60 uppercase">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-70 motion-reduce:animate-none" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
          </span>
          <span className="hidden sm:inline">{live} ·</span> {label}
        </span>
        <div className="relative min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_8%,black_92%,transparent)]">
          <ul className="landing-marquee flex w-max text-sm text-white/70">
            {[...names, ...names].map((name, i) => (
              <li key={i} aria-hidden={i >= names.length || undefined} className="flex items-center gap-8 pr-8 whitespace-nowrap">
                {name}
                <span aria-hidden className="size-1 rounded-full bg-white/25" />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
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

/** Signed in: one glowing card per screen in the viewer's menu. */
async function YourScreens({ locale }: { locale: Locale }) {
  const viewer = await getViewer();
  if (!viewer) return null;
  const t = createTranslator(locale, "home");
  const nav = createTranslator(locale, "nav");
  const items = [...NAV[viewer.role], ...SHARED_NAV];
  return (
    <section aria-labelledby="your-screens" className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 pb-24">
      <div className="reveal flex flex-col items-center gap-2 text-center">
        <h2 id="your-screens" className="text-3xl font-medium tracking-[-0.02em] text-white md:text-4xl">
          {viewer.role === "staff" ? t("staffTools") : t("yourScreens")}
        </h2>
        <p className="max-w-prose text-white/55">{t("yourScreensIntro")}</p>
      </div>
      <Spotlight>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <li key={item.href} className="reveal">
              <SpotCard className="h-full transition-transform duration-200 hover:-translate-y-0.5">
                <Link
                  href={item.href}
                  className="group flex h-full flex-col gap-1 rounded-[calc(1rem-1px)] p-5 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  <span className="flex items-center justify-between gap-2 font-medium text-white">
                    {nav(`${item.id}.label`)}
                    <ArrowUpRight
                      className="size-4 text-white/40 transition-[translate,color] duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-white group-focus-visible:text-white"
                      aria-hidden
                    />
                  </span>
                  <span className="text-sm text-white/55">{nav(`${item.id}.description`)}</span>
                </Link>
              </SpotCard>
            </li>
          ))}
        </ul>
      </Spotlight>
    </section>
  );
}

const PILL_PRIMARY = "h-9 rounded-full bg-white px-4 text-sm font-medium text-neutral-900 shadow-[0_8px_30px_-10px_white] hover:bg-white/90";

/** Decorative: tiny stars that twinkle slowly. */
function Starfield() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      <div className="animate-twinkle absolute inset-0 bg-[radial-gradient(1px_1px_at_20px_30px,white,transparent),radial-gradient(1px_1px_at_140px_90px,white,transparent),radial-gradient(1.5px_1.5px_at_230px_170px,white,transparent),radial-gradient(1px_1px_at_70px_210px,white,transparent)] bg-[length:300px_260px] opacity-40" />
      <div className="animate-twinkle absolute inset-0 bg-[radial-gradient(1px_1px_at_90px_40px,white,transparent),radial-gradient(1.5px_1.5px_at_10px_150px,white,transparent),radial-gradient(1px_1px_at_190px_230px,white,transparent)] bg-[length:380px_320px] opacity-30 [animation-delay:-2.5s]" />
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
