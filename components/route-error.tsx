"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";
import type { Messages } from "@/lib/i18n/translate";

/** The reference to quote to the team: Next.js gives server errors a digest that matches the server log. */
export function errorReference(error: unknown): string | null {
  if (error && typeof error === "object" && "digest" in error && typeof error.digest === "string" && error.digest) {
    return error.digest;
  }
  return null;
}

/** The pages with their own error texts in messages/*.json (`errors.pages`). */
export type ErrorPage = keyof Messages["errors"]["pages"];

/**
 * What an error.tsx shows (C20): what went wrong in one line (with the
 * reference to quote, when there is one), a Try again button and a quiet way out. Focus moves to the heading so a screen
 * reader hears it at once. The error's own message is not shown: in
 * production it is a generic text, and it can hold details users need not see.
 *
 * The words are in the reader's language (C19): `page` picks the texts from
 * the catalogue. `title`, `what` and `back.label` override them (screens not
 * translated yet pass their English texts).
 */
export function RouteError({
  error,
  retry,
  page = "default",
  title,
  what,
  back,
}: {
  error: unknown;
  retry: () => void;
  page?: ErrorPage;
  title?: string;
  what?: string;
  back?: { href: string; label?: string };
}) {
  const t = useT("errors");
  const heading = useRef<HTMLHeadingElement>(null);
  const reference = errorReference(error);

  useEffect(() => {
    console.error(error);
    heading.current?.focus();
  }, [error]);

  return (
    <section className="mx-auto flex w-full max-w-3xl animate-rise flex-col items-start gap-4 px-4 py-12 md:py-20">
      <h1 ref={heading} tabIndex={-1} className="text-title outline-none">
        {title ?? t(`pages.${page}.title`)}
      </h1>
      <p className="max-w-prose text-muted-foreground">
        {what ?? t(`pages.${page}.what`)}
        {reference ? (
          <>
            {" "}
            {t.rich("adviceWithReference", {
              reference: <code className="font-mono text-sm break-all text-foreground">{reference}</code>,
            })}
          </>
        ) : null}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-5">
        <Button type="button" size="lg" className="px-5" onClick={() => retry()}>
          {t("tryAgain")}
        </Button>
        <Link href={back?.href ?? "/"} className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          {back?.label ?? t(`pages.${page}.back`)}
        </Link>
      </div>
    </section>
  );
}
