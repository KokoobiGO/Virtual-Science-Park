import { ArrowLeft, Compass } from "lucide-react";
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
    <div className="stagger flex flex-col items-start gap-4">
      <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground" aria-hidden>
        <Compass className="size-6" />
      </span>
      <h1 className="text-title">{t("title")}</h1>
      <p className="max-w-prose text-muted-foreground">{t("text")}</p>
      <div>
        <Button size="lg" className="px-4" render={<Link href="/" />} nativeButton={false}>
          <ArrowLeft aria-hidden data-icon="inline-start" />
          {t("back")}
        </Button>
      </div>
    </div>
  );
}
