import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { getViewer } from "@/lib/auth";
import { HOME } from "@/lib/navigation";

export default function StartPage() {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-16">
      <p className="text-sm font-medium text-muted-foreground">Blue Science Park · Karlskrona</p>
      <h1 className="text-4xl font-semibold tracking-tight">Virtual Science Park</h1>
      <p className="max-w-prose text-lg text-muted-foreground">
        Every member gets a short list of funding calls, testbeds, events and partners that fit them this week. Every
        line shows where it came from, and nothing is called eligible: that stays a decision for people.
      </p>
      <Suspense fallback={<div className="h-9" aria-hidden />}>
        <StartAction />
      </Suspense>
    </section>
  );
}

async function StartAction() {
  const viewer = await getViewer();
  if (!viewer) {
    return (
      <div>
        <Button size="lg" render={<Link href="/sign-in" />} nativeButton={false}>
          Sign in
        </Button>
      </div>
    );
  }
  return (
    <div>
      <Button size="lg" render={<Link href={HOME[viewer.role]} />} nativeButton={false}>
        {viewer.role === "staff" ? "Open the staff tools" : "Open your week"}
      </Button>
    </div>
  );
}
