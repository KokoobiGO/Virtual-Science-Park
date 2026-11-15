import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState, PageShellSkeleton, Skeleton } from "@/components/loading-skeleton";
import { requireRole } from "@/lib/auth";
import { LocaleProvider } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/translate";
import { unconnected } from "@/lib/staff-views/ecosystem";
import { loadEcosystem } from "@/lib/staff-views/query";
import { StaffPageIntro } from "../page-intro";
import { EcosystemView } from "./ecosystem-view";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("ecosystem"))("title") };
}

/**
 * C17. The words follow the reader's language (C19), the disclaimer included
 * (`ecosystem.disclaimer`, the same words as CONNECTION_DISCLAIMER in English);
 * member names, the stated basis and the claims are shown as stored.
 */
export default function Page({ searchParams }: PageProps<"/staff/ecosystem">) {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
      <Suspense fallback={<PageShellSkeleton />}>
        <EcosystemFrame searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function EcosystemFrame({ searchParams }: Pick<PageProps<"/staff/ecosystem">, "searchParams">) {
  const locale = await getLocale();
  const t = createTranslator(locale, "ecosystem");
  return (
    <LocaleProvider locale={locale}>
      {/* The one line under the title is the disclaimer every suggested introduction carries. */}
      <StaffPageIntro
        title={t("title")}
        intro={
          <span role="note">
            {t("suggestionLabel")}. {t("disclaimer")}
          </span>
        }
      />
      <Suspense
        fallback={
          <LoadingState label={t("loading")}>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
              <Skeleton className="aspect-[760/440] w-full rounded-xl" />
              <div className="flex flex-col gap-1.5">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-14 rounded-lg" />
                ))}
              </div>
            </div>
          </LoadingState>
        }
      >
        <Ecosystem searchParams={searchParams} locale={locale} />
      </Suspense>
    </LocaleProvider>
  );
}

/** Reads the session and the stored connections, so it streams in behind the Suspense boundary above. */
async function Ecosystem({ searchParams, locale }: Pick<PageProps<"/staff/ecosystem">, "searchParams"> & { locale: Locale }) {
  // The proxy already sends members away; this refuses them on the server too.
  const viewer = await requireRole("staff");
  const t = createTranslator(locale, "ecosystem");
  const { members, connections } = await loadEcosystem(viewer.claims);
  const alone = unconnected(members, connections);
  // `?pair=<id>` opens one pair straight away, so a link can point at it.
  const pair = (await searchParams).pair;
  const openId = connections.find((c) => c.id === pair)?.id ?? null;

  return (
    <div className="flex flex-col gap-8">
      {connections.length ? (
        <EcosystemView connections={connections} openId={openId} />
      ) : (
        <p className="animate-fade text-sm text-muted-foreground">
          {t.rich("empty", { code: (chunk) => <code className="font-mono">{chunk}</code> })}
        </p>
      )}
      <div className="flex animate-rise flex-col gap-2">
        <h2 className="text-sm font-medium">{t("aloneTitle", { count: alone.length })}</h2>
        {alone.length ? (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {alone.map((m) => (
              <li key={m.id} className="break-words">
                {m.name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("aloneNone")}</p>
        )}
      </div>
    </div>
  );
}
