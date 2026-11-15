import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { CopilotLauncherSlot } from "@/components/copilot/copilot-launcher-slot";
import { HtmlLangScript } from "@/components/html-lang-script";
import { PointerGlow } from "@/components/pointer-glow";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { getT } from "@/lib/i18n/server";
import "./globals.css";

// The theme in globals.css reads --font-sans.
const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Virtual Science Park", template: "%s · Virtual Science Park" },
  description: "Weekly, evidence-backed opportunities for Blue Science Park members.",
};

/**
 * The language (C19) is a cookie, which is request-time data, so this layout
 * never reads it: that would hold every page behind the request. <html lang>
 * is set from the cookie by an inline script before the first paint (and kept
 * in step by the language switch); every text streams in, in the reader's
 * language, behind its own Suspense boundary, and the static shell holds
 * word-free skeletons.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        <HtmlLangScript />
      </head>
      <body className="flex min-h-full flex-col">
        <Suspense fallback={<SkipLink label="Skip to content" />}>
          <TranslatedSkipLink />
        </Suspense>
        <SiteHeader />
        <main id="main" tabIndex={-1} className="flex flex-1 flex-col outline-none">
          {children}
        </main>
        <SiteFooter />
        <PointerGlow />
        {/* Members only; reads the session, so it streams in after the page. */}
        <Suspense fallback={null}>
          <CopilotLauncherSlot />
        </Suspense>
      </body>
    </html>
  );
}

function SkipLink({ label }: { label: string }) {
  return (
    <a
      href="#main"
      className="sr-only rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
    >
      {label}
    </a>
  );
}

async function TranslatedSkipLink() {
  const t = await getT("layout");
  return <SkipLink label={t("skipToContent")} />;
}
