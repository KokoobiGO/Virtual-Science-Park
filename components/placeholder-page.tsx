import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getViewer, requireRole } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import type { AppRole } from "@/lib/schemas";

/**
 * Stand-in for a screen that is not built yet. The proxy already redirects the
 * wrong role away; the gate checks again on the server. `backlog` is for the
 * code reader only and is never shown (C20). The sentence follows the
 * reader's language (C19); `title` comes from the caller.
 */
export function PlaceholderPage({ title, role }: { title: string; backlog?: string; role?: AppRole }) {
  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-10">
      <h1 className="text-title">{title}</h1>
      <Suspense fallback={<p className="min-h-18 rounded-xl border border-dashed p-6" aria-hidden />}>
        <NotReady />
      </Suspense>
      <Suspense>
        <Gate role={role} />
      </Suspense>
    </section>
  );
}

async function NotReady() {
  const t = await getT("common");
  return <p className="rounded-xl border border-dashed p-6 text-muted-foreground">{t("notReady")}</p>;
}

async function Gate({ role }: { role?: AppRole }) {
  if (role) await requireRole(role);
  else if (!(await getViewer())) redirect("/sign-in");
  return null;
}
