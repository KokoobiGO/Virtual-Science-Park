import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page not found" };

/** Unknown addresses, and notFound() anywhere without a not-found page of its own (C20). */
export default function NotFound() {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-12">
      <h1 className="text-title">Page not found</h1>
      <p className="max-w-prose text-muted-foreground">
        There is no page at this address. The link may be old or mistyped. Start again from the start page, or use the
        menu at the top.
      </p>
      <div>
        <Button render={<Link href="/" />} nativeButton={false}>
          Go to the start page
        </Button>
      </div>
    </section>
  );
}
