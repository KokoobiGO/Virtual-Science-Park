import type { Metadata } from "next";
import { Suspense } from "react";
import { CopilotPanel } from "@/components/copilot/copilot-panel";
import { LoadingState, Skeleton } from "@/components/loading-skeleton";
import { requireRole } from "@/lib/auth";
import { LocaleProvider } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/translate";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Copilot", description: (await getT("copilot"))("description") };
}

/** "Copilot" is a name, the same in every language, so the heading stays in the static shell (C19). */
export default function Page() {
  return (
    <section className="mx-auto flex w-full max-w-3xl min-w-0 flex-1 flex-col gap-4 px-4 py-10">
      <h1 className="text-2xl font-semibold">Copilot</h1>
      <Suspense fallback={<CopilotSkeleton />}>
        <CopilotFrame />
      </Suspense>
    </section>
  );
}

/** The chat's shape while the language and the member's session are read (C20). Without a label it has no words, so the static shell carries none. */
function CopilotSkeleton({ label }: { label?: string }) {
  const shapes = (
    <>
      <Skeleton className="h-5 w-24" />
      <Skeleton className="h-4 w-full max-w-lg" />
      <Skeleton className="h-28 w-full max-w-md" />
      <div className="mt-auto flex gap-2">
        <Skeleton className="h-8 flex-1" />
        <Skeleton className="h-8 w-16" />
      </div>
    </>
  );
  const className = "min-h-[32rem] flex-1 rounded-xl p-4 ring-1 ring-foreground/10";
  return label ? (
    <LoadingState label={label} className={className}>
      {shapes}
    </LoadingState>
  ) : (
    <div aria-busy="true" className={`flex flex-col gap-4 ${className}`}>
      {shapes}
    </div>
  );
}

async function CopilotFrame() {
  const locale = await getLocale();
  const t = createTranslator(locale, "copilot");
  return (
    <Suspense fallback={<CopilotSkeleton label={t("loading")} />}>
      <MemberCopilot locale={locale} />
    </Suspense>
  );
}

/** Members only: the chat needs a company to store its turns under. */
async function MemberCopilot({ locale }: { locale: Locale }) {
  await requireRole("member");
  return (
    <LocaleProvider locale={locale}>
      <CopilotPanel className="min-h-[32rem] flex-1" />
    </LocaleProvider>
  );
}
