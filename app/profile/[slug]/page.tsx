import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { ProfileSkeleton } from "@/components/loading-skeleton";
import { getViewer } from "@/lib/auth";
import { withUserDb } from "@/lib/db/user";
import { profileView } from "@/lib/profile-view/claims";
import { loadPublicProfile } from "@/lib/profile-view/load";
import { CompanyHeader } from "../company-header";
import { FieldList } from "../field-list";

export const metadata = { title: "Public company profile" };

/**
 * C5, public view: any company's profile as everyone may see it, public
 * claims only, for staff and members alike. Row-level security hides other
 * companies' private claims; this page also leaves out the viewer's own, so a
 * member sees exactly what others see.
 */
export default function Page({ params }: PageProps<"/profile/[slug]">) {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10">
      <Suspense fallback={<ProfileSkeleton />}>
        {params.then(({ slug }) => (
          <PublicProfile slug={slug} />
        ))}
      </Suspense>
    </section>
  );
}

async function PublicProfile({ slug }: { slug: string }) {
  const viewer = await getViewer();
  if (!viewer) redirect(`/sign-in?next=${encodeURIComponent(`/profile/${slug}`)}`);
  const profile = await withUserDb(viewer.claims, (tx) => loadPublicProfile(tx, slug));
  if (!profile) notFound();
  const own = viewer.companyId === profile.company.id;

  return (
    <>
      <div className="flex flex-col gap-3">
        <Link href="/profile" className="text-sm text-primary underline-offset-4 hover:underline">
          {own ? "Back to your profile" : viewer.role === "staff" ? "All company profiles" : "Your company profile"}
        </Link>
        <CompanyHeader company={profile.company} />
      </div>
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Public profile</h2>
        <p className="text-sm text-muted-foreground">
          {own
            ? "This is what other members and BSP staff see: public fields only. Your private fields and priorities are not shown here."
            : "Public fields only, read from the company's own pages. Open the evidence under a field to see the quote it rests on."}
        </p>
        <FieldList fields={profileView(profile.rows, { publicOnly: true })} evidence={profile.evidence} />
      </div>
    </>
  );
}
