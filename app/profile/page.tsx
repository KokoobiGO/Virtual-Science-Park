import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Announcer } from "@/components/announcer";
import { PageShellSkeleton, ProfileSkeleton } from "@/components/loading-skeleton";
import { getViewer, type Viewer } from "@/lib/auth";
import { withUserDb } from "@/lib/db/user";
import { LocaleProvider } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/translate";
import { profileView } from "@/lib/profile-view/claims";
import { loadOwnProfile } from "@/lib/profile-view/load";
import { UserPriority } from "@/lib/schemas";
import { CompanyHeader } from "./company-header";
import { CompanyList } from "./company-list";
import { FieldList } from "./field-list";
import { PrioritySwitches } from "./priority-switches";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("profile"))("title") };
}

/**
 * C5 and C7. A member sees and edits its own company's profile; BSP staff get
 * the list of all companies, each linking to its public profile. The words
 * follow the reader's language (C19); values and quotes are shown as stored.
 */
export default function Page() {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10">
      <Suspense fallback={<PageShellSkeleton />}>
        <ProfileFrame />
      </Suspense>
    </section>
  );
}

/** Reads the language only, then waits for the session and the profile behind a skeleton in that language. */
async function ProfileFrame() {
  const locale = await getLocale();
  return (
    <LocaleProvider locale={locale}>
      <Suspense fallback={<ProfileSkeleton label={createTranslator(locale, "loading")("profile")} />}>
        <ProfileForViewer locale={locale} />
      </Suspense>
    </LocaleProvider>
  );
}

async function ProfileForViewer({ locale }: { locale: Locale }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in?next=/profile");
  if (viewer.role === "staff") return <CompanyList viewer={viewer} locale={locale} />;
  if (!viewer.companyId) {
    const t = createTranslator(locale, "profile");
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-title">{t("title")}</h1>
        <p className="max-w-prose text-muted-foreground">{t("notLinked")}</p>
      </div>
    );
  }
  return <OwnProfile viewer={viewer} companyId={viewer.companyId} locale={locale} />;
}

async function OwnProfile({ viewer, companyId, locale }: { viewer: Viewer; companyId: string; locale: Locale }) {
  const profile = await withUserDb(viewer.claims, (tx) => loadOwnProfile(tx, companyId));
  if (!profile) notFound();
  const t = createTranslator(locale, "profile");
  const fields = profileView(profile.rows, { locale });
  const open = fields.filter((f) => f.suggestion).length;

  return (
    <>
      <CompanyHeader company={profile.company} locale={locale} />
      <Announcer />
      <div className="flex animate-rise flex-col gap-2">
        <h2 className="text-lg font-semibold">{t("prioritiesTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("prioritiesIntro")}</p>
        <PrioritySwitches
          switches={UserPriority.options.map((priority) => ({
            priority,
            label: t(`priorities.names.${priority}`),
            on: profile.priorities.includes(priority),
          }))}
        />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">{t("profileTitle")}</h2>
          <Link href={`/profile/${profile.company.slug}`} className="text-sm text-primary underline-offset-4 hover:underline">
            {t("seePublic")}
          </Link>
        </div>
        {open ? <p className="text-sm text-muted-foreground">{t("suggestionsWaiting", { count: open })}</p> : null}
        <FieldList fields={fields} evidence={profile.evidence} editable locale={locale} />
      </div>
    </>
  );
}
