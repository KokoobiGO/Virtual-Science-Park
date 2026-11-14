import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { ClaimBadge } from "@/components/claim-badge";
import { Button } from "@/components/ui/button";
import { getViewer } from "@/lib/auth";
import { HOME, NAV, SHARED_NAV } from "@/lib/navigation";

const STEPS = [
  {
    title: "A profile from your own pages",
    text: "We read your website and your BSP member page. Every fact keeps the quote it came from, and you can correct it.",
    badges: true,
  },
  {
    title: "This week's calls, testbeds and events",
    text: "Vinnova, Energimyndigheten, EU calls, regional funding, testbeds and BSP events are read every night and ranked for you.",
    badges: false,
  },
  {
    title: "People decide",
    text: "Every item is a potential match with a next step, never a verdict. BSP staff help when you want to take it further.",
    badges: false,
  },
];

export default function StartPage() {
  return (
    <div className="flex flex-col">
      <section className="border-b bg-card/60">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-14 md:py-20">
          <p className="text-sm font-medium text-primary">Blue Science Park · Karlskrona</p>
          <h1 className="max-w-3xl text-title md:text-display">Each week, the opportunities that may fit your company</h1>
          <p className="max-w-prose text-lg text-muted-foreground">
            Virtual Science Park gives every Blue Science Park member a short list of funding calls, testbeds, events
            and partners. Every line shows where it came from, so you can check it yourself.
          </p>
          <Suspense fallback={<div className="h-9" aria-hidden />}>
            <StartAction />
          </Suspense>
        </div>
      </section>

      <section aria-labelledby="how" className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-12">
        <h2 id="how" className="text-heading">
          How it works
        </h2>
        <ol className="grid gap-4 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex flex-col gap-2 rounded-xl bg-card p-5 shadow-card ring-1 ring-foreground/10">
              <span className="flex size-7 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground" aria-hidden>
                {i + 1}
              </span>
              <h3 className="font-semibold">{step.title}</h3>
              <p className="text-sm text-muted-foreground">{step.text}</p>
              {step.badges ? (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <ClaimBadge status="stated" />
                  <ClaimBadge status="inferred" />
                  <ClaimBadge status="missing" />
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      <Suspense fallback={null}>
        <YourScreens />
      </Suspense>
    </div>
  );
}

async function StartAction() {
  const viewer = await getViewer();
  if (!viewer) {
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button size="lg" className="px-4" render={<Link href="/sign-in" />} nativeButton={false}>
          Sign in
          <ArrowRight aria-hidden data-icon="inline-end" />
        </Button>
        <p className="text-sm text-muted-foreground">Accounts are set up by BSP staff for members.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <Button size="lg" className="px-4" render={<Link href={HOME[viewer.role]} />} nativeButton={false}>
        {viewer.role === "staff" ? "Open the staff tools" : "Open your week"}
        <ArrowRight aria-hidden data-icon="inline-end" />
      </Button>
    </div>
  );
}

/** Signed in: one card per screen in the viewer's menu. */
async function YourScreens() {
  const viewer = await getViewer();
  if (!viewer) return null;
  const items = [...NAV[viewer.role], ...SHARED_NAV];
  return (
    <section aria-labelledby="your-screens" className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 pb-14">
      <h2 id="your-screens" className="text-heading">
        {viewer.role === "staff" ? "Staff tools" : "Your screens"}
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="group flex h-full flex-col gap-1 rounded-xl bg-card p-4 shadow-card ring-1 ring-foreground/10 transition-colors outline-none hover:ring-primary/50 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex items-center justify-between gap-2 font-medium">
                {item.label}
                <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
              </span>
              <span className="text-sm text-muted-foreground">{item.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
