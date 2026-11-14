import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { PageShellSkeleton, ProfileSkeleton } from "@/components/loading-skeleton";
import { getViewer } from "@/lib/auth";
import { withUserDb } from "@/lib/db/user";
import { LocaleProvider } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/translate";
import { profileView } from "@/lib/profile-view/claims";
import { loadPublicProfile } from "@/lib/profile-view/load";
import { CompanyHeader } from "../company-header";
import { FieldList } from "../field-list";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("profile"))("publicDocumentTitle") };
}

/**
 * C5, public view: any company's profile as everyone may see it, public
 * claims only, for staff and members alike. Row-level security hides other
 * companies' private claims; this page also leaves out the viewer's own, so a
 * member sees exactly what others see.
 */
export default function Page({ params }: PageProps<"/profile/[slug]">) {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10">
      <Suspense fallback={<PageShellSkeleton />}>
        <PublicFrame params={params} />
      </Suspense>
    </section>
  );
}

/** Reads the language (C19), then waits for the profile behind a skeleton in that language. */
async function PublicFrame({ params }: Pick<PageProps<"/profile/[slug]">, "params">) {
  const locale = await getLocale();
  return (
    <LocaleProvider locale={locale}>
      <Suspense fallback={<ProfileSkeleton label={createTranslator(locale, "loading")("profile")} />}>
        {params.then(({ slug }) => (
          <PublicProfile slug={slug} locale={locale} />
        ))}
      </Suspense>
    </LocaleProvider>
  );
}

async function PublicProfile({ slug, locale }: { slug: string; locale: Locale }) {
  const viewer = await getViewer();
  if (!viewer) redirect(`/sign-in?next=${encodeURIComponent(`/profile/${slug}`)}`);
  const profile = await withUserDb(viewer.claims, (tx) => loadPublicProfile(tx, slug));
  if (!profile) notFound();
  const own = viewer.companyId === profile.company.id;
  const t = createTranslator(locale, "profile");

  return (
    <>
      <div className="flex flex-col gap-3">
        <Link href="/profile" className="text-sm text-primary underline-offset-4 hover:underline">
          {own ? t("public.backOwn") : viewer.role === "staff" ? t("public.backStaff") : t("public.backMember")}
        </Link>
        <CompanyHeader company={profile.company} locale={locale} />
      </div>
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("public.title")}</h2>
        <p className="text-sm text-muted-foreground">{own ? t("public.introOwn") : t("public.introOther")}</p>
        <FieldList fields={profileView(profile.rows, { publicOnly: true, locale })} evidence={profile.evidence} locale={locale} />
      </div>
    </>
  );
}
