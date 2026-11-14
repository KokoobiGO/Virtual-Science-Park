"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

/** The reference to quote to the team: Next.js gives server errors a digest that matches the server log. */
export function errorReference(error: unknown): string | null {
  if (error && typeof error === "object" && "digest" in error && typeof error.digest === "string" && error.digest) {
    return error.digest;
  }
  return null;
}

/**
 * What an error.tsx shows (C20): what went wrong in plain words, what to do,
 * a Try again button and a way out. Focus moves to the heading so a screen
 * reader hears it at once. The error's own message is not shown: in
 * production it is a generic text, and it can hold details users need not see.
 */
export function RouteError({
  error,
  retry,
  title = "This page could not be loaded",
  what = "Something went wrong on our side while loading it.",
  back = { href: "/", label: "Go to the start page" },
}: {
  error: unknown;
  retry: () => void;
  title?: string;
  what?: string;
  back?: { href: string; label: string };
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const reference = errorReference(error);

  useEffect(() => {
    console.error(error);
    heading.current?.focus();
  }, [error]);

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-12">
      <h1 ref={heading} tabIndex={-1} className="text-title outline-none">
        {title}
      </h1>
      <p className="max-w-prose text-muted-foreground">
        {what} Try again in a moment. If it keeps happening, tell BSP staff
        {reference ? (
          <>
            {" "}
            and give them this reference: <code className="font-mono text-sm break-all text-foreground">{reference}</code>
          </>
        ) : null}
        .
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => retry()}>
          Try again
        </Button>
        <Button variant="outline" render={<Link href={back.href} />} nativeButton={false}>
          {back.label}
        </Button>
      </div>
    </section>
  );
}
