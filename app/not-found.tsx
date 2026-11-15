import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageShellSkeleton } from "@/components/loading-skeleton";
import { Button } from "@/components/ui/button";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("notFound"))("title") };
}

/** Unknown addresses, and notFound() anywhere without a not-found page of its own (C20). */
export default function NotFound() {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col items-start gap-4 px-4 py-12 md:py-20">
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
    <div className="flex animate-rise flex-col items-start gap-4">
      <h1 className="text-title">{t("title")}</h1>
      <p className="max-w-prose text-muted-foreground">{t("text")}</p>
      <Button size="lg" className="mt-2 px-5" render={<Link href="/" />} nativeButton={false}>
        {t("back")}
      </Button>
    </div>
  );
}
