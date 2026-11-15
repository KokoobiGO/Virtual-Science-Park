import Link from "next/link";
import { Suspense } from "react";
import { signOut } from "@/app/actions/auth";
import { LanguageSwitch } from "@/components/language-switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NavMenu } from "@/components/ui/nav-menu";
import { getViewer } from "@/lib/auth";
import { getLocale } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/translate";
import { NAV, SHARED_NAV } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * The site chrome (C2): header with the menu for the signed-in role, and the
 * footer. The names "Virtual Science Park" and "Blue Science Park" are the
 * same in every language, so the brand stays in the static shell; everything
 * with words streams in with the reader's language (C19).
 */
export function SiteHeader() {
  return (
    <header data-site-header className="sticky top-0 z-40 border-b border-white/[0.06] bg-background/70 backdrop-blur-xl supports-[backdrop-filter]:bg-background/55">
      <div className="mx-auto flex min-h-14 w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2">
        <Link
          href="/"
          className="group/brand -mx-1 flex items-center gap-2.5 rounded-md px-1 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <LogoMark />
          <span className="font-heading text-[0.95rem] font-medium tracking-tight">Virtual Science Park</span>
        </Link>
        <Suspense fallback={<div className="h-8 flex-1" aria-hidden />}>
          <HeaderNav />
        </Suspense>
      </div>
    </header>
  );
}

/** Reads the session and the language, so it streams in behind the Suspense boundary above. */
async function HeaderNav() {
  const [viewer, locale] = await Promise.all([getViewer(), getLocale()]);
  const t = createTranslator(locale, "layout");
  const nav = createTranslator(locale, "nav");
  const common = createTranslator(locale, "common");
  const languageSwitch = <LanguageSwitch locale={locale} label={t("language")} />;

  if (!viewer) {
    return (
      <div className="ml-auto flex items-center gap-3">
        {languageSwitch}
        <Button size="sm" render={<Link href="/sign-in" />} nativeButton={false}>
          {t("signIn")}
        </Button>
      </div>
    );
  }

  // Read through the user's own client, so row-level security applies here too.
  let companyName: string | null = null;
  if (viewer.companyId) {
    const supabase = await createClient();
    const { data } = await supabase.from("companies").select("name").eq("id", viewer.companyId).maybeSingle();
    companyName = data?.name ?? null;
  }

  const items = NAV[viewer.role].map(({ id, href }) => ({ href, label: nav(`${id}.label`) }));
  return (
    <NavMenu
      items={items}
      label={viewer.role === "staff" ? t("staffMenu") : t("memberMenu")}
      menuLabel={t("menuButton")}
      extra={
        <>
          {languageSwitch}
          <Badge variant="secondary" data-testid="signed-in-as" title={companyName ?? viewer.email ?? undefined}>
            <span>{common(`roles.${viewer.role}`)}</span>
            <span className="sr-only">: {companyName ?? viewer.email}</span>
          </Badge>
          <form action={signOut}>
            <Button type="submit" variant="outline" size="sm">
              {t("signOut")}
            </Button>
          </form>
        </>
      }
    />
  );
}

export function SiteFooter() {
  return (
    <footer data-site-footer className="mt-auto border-t">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-6 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
        <Suspense fallback={<div className="h-10 max-w-prose flex-1" aria-hidden />}>
          <FooterText />
        </Suspense>
        <Suspense fallback={null}>
          <FooterNav />
        </Suspense>
      </div>
    </footer>
  );
}

/** Reads the language only, so it arrives with the first bytes of the dynamic part. */
async function FooterText() {
  const t = createTranslator(await getLocale(), "layout");
  return <p className="max-w-prose">{t("footerText")}</p>;
}

async function FooterNav() {
  const [viewer, locale] = await Promise.all([getViewer(), getLocale()]);
  if (!viewer) return null;
  const t = createTranslator(locale, "layout");
  const nav = createTranslator(locale, "nav");
  return (
    <nav aria-label={t("footerNav")}>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {SHARED_NAV.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="font-medium text-foreground underline-offset-4 hover:underline">
              {nav(`${item.id}.label`)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** A plain mark: a rounded square in the brand blue with a wave. Decorative. */
function LogoMark() {
  return (
    <svg
      viewBox="0 0 32 32"
      className="size-8 shrink-0 transition-transform duration-300 ease-(--ease-out-soft) group-hover/brand:-rotate-6"
      aria-hidden
      focusable="false"
    >
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <path
        d="M6 19c2.5 0 3.5-3 6-3s3.5 3 6 3 3.5-3 6-3 2 1 2 1"
        fill="none"
        className="stroke-primary-foreground"
        strokeWidth="2.25"
        strokeLinecap="round"
      />
      <path
        d="M6 13c2.5 0 3.5-3 6-3s3.5 3 6 3 3.5-3 6-3 2 1 2 1"
        fill="none"
        className="stroke-primary-foreground"
        strokeOpacity="0.55"
        strokeWidth="2.25"
        strokeLinecap="round"
      />
    </svg>
  );
}
