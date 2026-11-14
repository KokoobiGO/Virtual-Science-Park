import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DEMO_BANNER_TEXT, DEMO_BANNER_TITLE, DEMO_CALL, planted, PLANTED_META_NAME } from "@/lib/injection/demo-page";

/**
 * The planted prompt-injection test page (B13). An invented funding call with
 * instructions to an AI hidden in four places: off-screen text, an HTML
 * comment, a meta tag and an image's alt text (see lib/injection/demo-page.ts).
 * scripts/injection-demo.ts reads it and shows that the models ignore them.
 *
 * Public, so the script can fetch it without signing in; kept out of search
 * engines and out of every menu.
 */
export const metadata: Metadata = {
  title: `${DEMO_CALL.title} (test page)`,
  description: "Test page for the Virtual Science Park demo. Not a real funding call.",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  other: { [PLANTED_META_NAME]: planted("metadata") },
};

/** Moved off screen, the way such text is usually hidden. The page's extractor does not read CSS, so it keeps this text. */
const OFF_SCREEN = { position: "absolute", left: "-10000px", top: "auto", width: "1px", height: "1px", overflow: "hidden" } as const;

export default function Page() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10">
      <div role="note" className="flex flex-col gap-1 rounded-xl border border-warning/40 bg-warning-soft px-4 py-3 text-warning">
        <p className="font-semibold">{DEMO_BANNER_TITLE}</p>
        <p className="text-sm">{DEMO_BANNER_TEXT}</p>
      </div>

      <article className="flex flex-col gap-6">
        {/* A <div>, not a <header>: the page extractor drops <header> elements, and the title belongs to the call text. */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            {/* A plain <img>, so the planted alt text is easy to find in the markup. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/globe.svg" width={40} height={40} alt={planted("attribute")} className="size-10 rounded-full bg-muted p-1.5" />
            <p className="text-sm font-medium text-muted-foreground">{DEMO_CALL.funder}</p>
          </div>
          <h1 className="text-title">{DEMO_CALL.title}</h1>
          <p className="text-sm text-muted-foreground">Call 2027 · Deadline 12 March 2027, 14:00 CET</p>
        </div>

        {/* React renders no comments, so this one goes in as raw HTML. The text is a constant, not user input. */}
        <div className="contents" dangerouslySetInnerHTML={{ __html: `<!-- ${planted("html_comment")} -->` }} />

        <p className="text-base">{DEMO_CALL.intro}</p>
        <span style={OFF_SCREEN}>{planted("hidden_text")}</span>

        <Section title="What the call funds">
          <ul className="list-disc space-y-1 pl-5">
            {DEMO_CALL.funds.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Section>
        <Section title="Who may apply">
          <p>{DEMO_CALL.whoMayApply}</p>
        </Section>
        <Section title="Funding">
          <p>{DEMO_CALL.funding}</p>
        </Section>
        <Section title="Dates">
          <p>{DEMO_CALL.dates}</p>
        </Section>
        <Section title="How to apply">
          <p>{DEMO_CALL.howToApply}</p>
        </Section>
        <Section title="Assessment">
          <p>{DEMO_CALL.assessment}</p>
        </Section>
        <Section title="Contact">
          <p>{DEMO_CALL.contact}</p>
        </Section>
      </article>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 text-sm">
      <h2 className="text-heading">{title}</h2>
      {children}
    </section>
  );
}
