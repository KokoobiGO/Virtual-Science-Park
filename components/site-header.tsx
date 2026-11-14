import Link from "next/link";
import { Suspense } from "react";
import { signOut } from "@/app/actions/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NavMenu } from "@/components/ui/nav-menu";
import { getViewer } from "@/lib/auth";
import { NAV, SHARED_NAV } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";

/** The site chrome (C2): header with the menu for the signed-in role, and the footer. */
export function SiteHeader() {
  return (
    <header className="border-b bg-card/70">
      <div className="mx-auto flex min-h-14 w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2">
        <Link href="/" className="-mx-1 flex items-center gap-2.5 rounded-md px-1 py-1">
          <LogoMark />
          <span className="flex flex-col leading-tight">
            <span className="font-heading text-[0.95rem] font-semibold tracking-tight">Virtual Science Park</span>
            <span className="text-xs text-muted-foreground">Blue Science Park</span>
          </span>
        </Link>
        <Suspense fallback={<div className="h-8 flex-1" aria-hidden />}>
          <HeaderNav />
        </Suspense>
      </div>
    </header>
  );
}

/** Reads the session, so it streams in behind the Suspense boundary above. */
async function HeaderNav() {
  const viewer = await getViewer();

  if (!viewer) {
    return (
      <div className="ml-auto">
        <Button size="sm" render={<Link href="/sign-in" />} nativeButton={false}>
          Sign in
        </Button>
      </div>
    );
  }

  // Read through the user's own client, so row-level security applies here too.
  let companyName: string | null = null;
  if (viewer.companyId) {
    const supabase = await createClient();
    const { data } = await supabase.from("companies").select("name").eq("id", viewer.companyId).maybeSingle();
    companyName = data?.name ?? null;
  }

  const items = NAV[viewer.role].map(({ href, label }) => ({ href, label }));
  return (
    <NavMenu
      items={items}
      label={viewer.role === "staff" ? "Staff menu" : "Member menu"}
      extra={
        <>
          <Badge variant={viewer.role === "staff" ? "default" : "secondary"}>
            {viewer.role === "staff" ? "BSP staff" : "Member"}
          </Badge>
          <span className="max-w-48 truncate text-sm text-muted-foreground" data-testid="signed-in-as">
            {companyName ?? viewer.email}
          </span>
          <form action={signOut}>
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </>
      }
    />
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-6 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
        <p className="max-w-prose">
          Virtual Science Park for Blue Science Park, Karlskrona. Every item is a potential match with its source;
          whether to apply is for people to decide.
        </p>
        <Suspense fallback={null}>
          <FooterNav />
        </Suspense>
      </div>
    </footer>
  );
}

async function FooterNav() {
  const viewer = await getViewer();
  if (!viewer) return null;
  return (
    <nav aria-label="More">
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {SHARED_NAV.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="font-medium text-foreground underline-offset-4 hover:underline">
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** A plain mark: a rounded square in the brand blue with a wave. Decorative. */
function LogoMark() {
  return (
    <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden focusable="false">
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <path
        d="M6 19c2.5 0 3.5-3 6-3s3.5 3 6 3 3.5-3 6-3 2 1 2 1"
        fill="none"
        className="stroke-primary-foreground"
        strokeWidth="2.25"
        strokeLinecap="round"
      />
      <path
        d="M6 13c2.5 0 3.5-3 6-3s3.5 3 6 3 3.5-3 6-3 2 1 2 1"
        fill="none"
        className="stroke-primary-foreground"
        strokeOpacity="0.55"
        strokeWidth="2.25"
        strokeLinecap="round"
      />
    </svg>
  );
}
