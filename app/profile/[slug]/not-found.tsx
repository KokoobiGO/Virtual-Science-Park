import Link from "next/link";
import { Suspense } from "react";
import { PageShellSkeleton } from "@/components/loading-skeleton";
import { Button } from "@/components/ui/button";
import { getT } from "@/lib/i18n/server";

/** /profile/<slug> for a slug that is no member company (C20). */
export default function NotFound() {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-10">
      <Suspense fallback={<PageShellSkeleton />}>
        <NotFoundText />
      </Suspense>
    </section>
  );
}

/** In the reader's language (C19), so behind the boundary above. */
async function NotFoundText() {
  const t = await getT("notFound");
  return (
    <>
      <h1 className="text-title">{t("profileTitle")}</h1>
      <p className="max-w-prose text-muted-foreground">{t("profileText")}</p>
      <div>
        <Button render={<Link href="/profile" />} nativeButton={false}>
          {t("profileBack")}
        </Button>
      </div>
    </>
  );
}
