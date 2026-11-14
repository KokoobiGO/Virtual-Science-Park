import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LoadingState, PageShellSkeleton, Skeleton } from "@/components/loading-skeleton";
import { buttonVariants } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { FileText } from "lucide-react";
import { StaffPageIntro } from "../page-intro";
import type { Locale } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/translate";
import { DEMO_PAGE_PATH } from "@/lib/injection/demo-page";
import { loadDemoResult } from "./load";
import { InjectionDemoView } from "./result-view";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("injection"))("title") };
}

/**
 * B13: the last recorded run of the planted prompt-injection demo. Staff only; reads a file, calls no model.
 * Words in the reader's language (C19); the planted text and the model's answers are shown as recorded.
 */
export default function Page() {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
      <Suspense fallback={<PageShellSkeleton />}>
        <InjectionFrame />
      </Suspense>
    </section>
  );
}

async function InjectionFrame() {
  const locale = await getLocale();
  const t = createTranslator(locale, "injection");
  return (
    <>
      <StaffPageIntro
        title={t("title")}
        intro={t.rich("intro", {
          link: (chunk) => (
            <Link href={DEMO_PAGE_PATH} className="text-primary underline-offset-4 hover:underline">
              {chunk}
            </Link>
          ),
          code: (chunk) => <code className="font-mono text-sm">{chunk}</code>,
        })}
        todo={t("todo")}
      >
        <Link href={DEMO_PAGE_PATH} className={buttonVariants({ variant: "outline", className: "press w-fit" })}>
          <FileText aria-hidden />
          {t("openTestPage")}
        </Link>
      </StaffPageIntro>
      <Suspense
        fallback={
          <LoadingState label={t("loading")}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))}
          </LoadingState>
        }
      >
        <LastRun locale={locale} />
      </Suspense>
    </>
  );
}

async function LastRun({ locale }: { locale: Locale }) {
  // The proxy already sends members away; this refuses them on the server too.
  await requireRole("staff");
  const t = createTranslator(locale, "injection");
  const loaded = await loadDemoResult();
  if (loaded.state === "missing") {
    return (
      <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
        {t.rich("missing", { code: (chunk) => <code className="font-mono break-all">{chunk}</code> })}
      </p>
    );
  }
  if (loaded.state === "invalid") {
    return (
      <p role="alert" className="text-sm text-destructive">
        {t("invalid", { error: loaded.error })}
      </p>
    );
  }
  return <InjectionDemoView result={loaded.result} locale={locale} />;
}
