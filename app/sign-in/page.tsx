import { Building2, ShieldCheck, UserRoundPlus } from "lucide-react";
import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { LoadingState, PageShellSkeleton, Skeleton } from "@/components/loading-skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DEMO_ACCOUNTS } from "@/lib/demo-accounts";
import { LocaleProvider } from "@/lib/i18n/client";
import { getLocale, getT } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/translate";
import { SignInForm } from "./sign-in-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("signIn"))("title") };
}

export default function SignInPage() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-12 md:py-16">
      <Suspense fallback={<PageShellSkeleton />}>
        <SignInContent />
      </Suspense>
    </div>
  );
}

/** Every word here follows the reader's language (C19), so it streams in after the static shell. */
async function SignInContent() {
  const locale = await getLocale();
  const t = createTranslator(locale, "signIn");
  const roles = createTranslator(locale, "common");
  return (
    <LocaleProvider locale={locale}>
      <div className="flex flex-col gap-2 animate-rise">
        <h1 className="text-title">{t("title")}</h1>
        <p className="text-muted-foreground">{t("intro")}</p>
      </div>
      <Card className="animate-rise [animation-delay:60ms]">
        <CardHeader>
          <CardTitle>{t("cardTitle")}</CardTitle>
          <CardDescription>{t("cardDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<SignInFormSkeleton label={t("loadingForm")} />}>
            <SignInForm />
          </Suspense>
        </CardContent>
      </Card>
      <section aria-labelledby="after-sign-in" className="flex flex-col gap-3 animate-rise [animation-delay:120ms]">
        <h2 id="after-sign-in" className="font-semibold">
          {t("nextTitle")}
        </h2>
        <ul className="flex flex-col gap-3 text-sm">
          <NextStep icon={<Building2 className="size-4" />} title={roles("roles.member")} text={t("nextMember")} />
          <NextStep icon={<ShieldCheck className="size-4" />} title={roles("roles.staff")} text={t("nextStaff")} />
          <NextStep icon={<UserRoundPlus className="size-4" />} title={t("noAccountTitle")} text={t("noAccount")} />
        </ul>
      </section>
      <section aria-labelledby="demo-accounts" className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground animate-rise [animation-delay:180ms]">
        <h2 id="demo-accounts" className="mb-2 font-medium text-foreground">
          {t("demoAccounts")}
        </h2>
        <ul className="flex flex-col gap-1">
          {DEMO_ACCOUNTS.map((a) => (
            <li key={a.email} className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="font-mono break-all text-foreground">{a.email}</span>
              <span>{roles(`roles.${a.role}`)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3">{t("passwordNote")}</p>
      </section>
    </LocaleProvider>
  );
}

/** One line of "What happens next": who, and where they land. */
function NextStep({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary" aria-hidden>
        {icon}
      </span>
      <span className="flex flex-col">
        <span className="font-medium text-foreground">{title}</span>
        <span className="text-muted-foreground">{text}</span>
      </span>
    </li>
  );
}

/** Until the form can read the page address (it keeps ?next=). */
function SignInFormSkeleton({ label }: { label: string }) {
  return (
    <LoadingState label={label}>
      <Skeleton className="h-16" />
      <Skeleton className="h-16" />
      <Skeleton className="h-10" />
    </LoadingState>
  );
}
