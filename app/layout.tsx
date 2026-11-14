import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { CopilotLauncherSlot } from "@/components/copilot/copilot-launcher-slot";
import { SiteFooter, SiteHeader } from "@/components/site-header";
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" tabIndex={-1} className="flex flex-1 flex-col outline-none">
          {children}
        </main>
        <SiteFooter />
        {/* Members only; reads the session, so it streams in after the page. */}
        <Suspense fallback={null}>
          <CopilotLauncherSlot />
        </Suspense>
      </body>
    </html>
  );
}
