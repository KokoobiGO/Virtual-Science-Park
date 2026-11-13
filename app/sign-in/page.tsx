import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DEMO_ACCOUNTS } from "@/lib/demo-accounts";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6 px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Members see their own week. BSP staff see the staff tools.</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense>
            <SignInForm />
          </Suspense>
        </CardContent>
      </Card>
      <section aria-labelledby="demo-accounts" className="text-sm text-muted-foreground">
        <h2 id="demo-accounts" className="mb-2 font-medium text-foreground">
          Demo accounts
        </h2>
        <ul className="flex flex-col gap-1">
          {DEMO_ACCOUNTS.map((a) => (
            <li key={a.email}>
              <span className="font-mono">{a.email}</span> · {a.role}
            </li>
          ))}
        </ul>
        <p className="mt-2">The password is shared with the team, not shown here.</p>
      </section>
    </div>
  );
}
