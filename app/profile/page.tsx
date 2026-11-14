import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { getViewer, type Viewer } from "@/lib/auth";
import { withUserDb } from "@/lib/db/user";
import { profileView } from "@/lib/profile-view/claims";
import { PRIORITY_TEXT } from "@/lib/profile-view/edit";
import { loadOwnProfile } from "@/lib/profile-view/load";
import { UserPriority } from "@/lib/schemas";
import { CompanyHeader } from "./company-header";
import { CompanyList } from "./company-list";
import { FieldList } from "./field-list";
import { PrioritySwitches } from "./priority-switches";

export const metadata = { title: "Company profile" };

/**
 * C5 and C7. A member sees and edits its own company's profile; BSP staff get
 * the list of all companies, each linking to its public profile.
 */
export default function Page() {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10">
      <Suspense fallback={<p className="text-muted-foreground">Loading the profile{"…"}</p>}>
        <ProfileForViewer />
      </Suspense>
    </section>
  );
}

async function ProfileForViewer() {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in?next=/profile");
  if (viewer.role === "staff") return <CompanyList viewer={viewer} />;
  if (!viewer.companyId) redirect("/");
  return <OwnProfile viewer={viewer} companyId={viewer.companyId} />;
}

async function OwnProfile({ viewer, companyId }: { viewer: Viewer; companyId: string }) {
  const profile = await withUserDb(viewer.claims, (tx) => loadOwnProfile(tx, companyId));
  if (!profile) notFound();
  const fields = profileView(profile.rows);
  const open = fields.filter((f) => f.suggestion).length;

  return (
    <>
      <CompanyHeader company={profile.company} />

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Your priorities</h2>
        <p className="text-sm text-muted-foreground">
          What you want from BSP right now. They steer your own ranking only; nobody outside your company sees them.
        </p>
        <PrioritySwitches
          switches={UserPriority.options.map((priority) => ({
            priority,
            label: PRIORITY_TEXT[priority],
            on: profile.priorities.includes(priority),
          }))}
        />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Profile</h2>
          <Link href={`/profile/${profile.company.slug}`} className="text-sm text-primary underline-offset-4 hover:underline">
            See your public profile
          </Link>
        </div>
        <p className="text-sm text-muted-foreground">
          Read from your public pages. Open the evidence under a field to see the quote it rests on. Edit a field to put it in
          your own words: your value replaces ours, and you choose whether it is public or private.
          {open ? ` ${open === 1 ? "One field has" : `${open} fields have`} a suggested update waiting for you.` : ""}
        </p>
        <FieldList fields={fields} evidence={profile.evidence} editable />
      </div>
    </>
  );
}
