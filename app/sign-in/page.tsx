import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DEMO_ACCOUNTS } from "@/lib/demo-accounts";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-12 md:py-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-title">Sign in</h1>
        <p className="text-muted-foreground">Members see their own week. BSP staff see the staff tools.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Your account</CardTitle>
          <CardDescription>Use the email address BSP staff set up for you.</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense>
            <SignInForm />
          </Suspense>
        </CardContent>
      </Card>
      <section aria-labelledby="demo-accounts" className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        <h2 id="demo-accounts" className="mb-2 font-medium text-foreground">
          Demo accounts
        </h2>
        <ul className="flex flex-col gap-1">
          {DEMO_ACCOUNTS.map((a) => (
            <li key={a.email} className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="font-mono text-foreground">{a.email}</span>
              <span>{a.role === "staff" ? "BSP staff" : "Member"}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3">The password is shared with the team, not shown here.</p>
      </section>
    </div>
  );
}
