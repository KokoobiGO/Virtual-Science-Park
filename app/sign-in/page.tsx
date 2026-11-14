import type { Metadata } from "next";
import { Suspense } from "react";
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
      <div className="flex flex-col gap-2">
        <h1 className="text-title">{t("title")}</h1>
        <p className="text-muted-foreground">{t("intro")}</p>
      </div>
      <Card>
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
      <section aria-labelledby="demo-accounts" className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
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

/** Until the form can read the page address (it keeps ?next=). */
function SignInFormSkeleton({ label }: { label: string }) {
  return (
    <LoadingState label={label}>
      <Skeleton className="h-14" />
      <Skeleton className="h-14" />
      <Skeleton className="h-9" />
    </LoadingState>
  );
}
