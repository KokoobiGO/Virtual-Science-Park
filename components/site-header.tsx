import Link from "next/link";
import { Suspense } from "react";
import { signOut } from "@/app/actions/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getViewer } from "@/lib/auth";
import { NAV } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";

export function SiteHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex min-h-14 w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2">
        <Link href="/" className="font-semibold">
          Virtual Science Park
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
      <nav className="ml-auto">
        <Button variant="outline" render={<Link href="/sign-in" />} nativeButton={false}>
          Sign in
        </Button>
      </nav>
    );
  }

  // Read through the user's own client, so row-level security applies here too.
  let companyName: string | null = null;
  if (viewer.companyId) {
    const supabase = await createClient();
    const { data } = await supabase.from("companies").select("name").eq("id", viewer.companyId).maybeSingle();
    companyName = data?.name ?? null;
  }

  return (
    <>
      <nav aria-label="Main" className="flex flex-1 flex-wrap items-center gap-1">
        {NAV[viewer.role].map((item) => (
          <Button key={item.href} variant="ghost" size="sm" render={<Link href={item.href} />} nativeButton={false}>
            {item.label}
          </Button>
        ))}
      </nav>
      <div className="flex items-center gap-2 text-sm">
        <Badge variant={viewer.role === "staff" ? "default" : "secondary"}>
          {viewer.role === "staff" ? "BSP staff" : "Member"}
        </Badge>
        <span className="text-muted-foreground" data-testid="signed-in-as">
          {companyName ?? viewer.email}
        </span>
        <form action={signOut}>
          <Button type="submit" variant="outline" size="sm">
            Sign out
          </Button>
        </form>
      </div>
    </>
  );
}
