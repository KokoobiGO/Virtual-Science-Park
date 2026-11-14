import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getViewer, requireRole } from "@/lib/auth";
import type { AppRole } from "@/lib/schemas";

/**
 * Stand-in for a screen that is not built yet. The proxy already redirects the
 * wrong role away; the gate checks again on the server. `backlog` is for the
 * code reader only and is never shown (C20).
 */
export function PlaceholderPage({ title, role }: { title: string; backlog?: string; role?: AppRole }) {
  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-10">
      <h1 className="text-title">{title}</h1>
      <p className="rounded-xl border border-dashed p-6 text-muted-foreground">
        This screen is not ready yet. Use the menu to open another one.
      </p>
      <Suspense>
        <Gate role={role} />
      </Suspense>
    </section>
  );
}

async function Gate({ role }: { role?: AppRole }) {
  if (role) await requireRole(role);
  else if (!(await getViewer())) redirect("/sign-in");
  return null;
}
