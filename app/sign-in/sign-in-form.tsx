"use client";

import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { signIn, type SignInState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/i18n/client";

const initialState: SignInState = { error: null };

export function SignInForm() {
  const next = useSearchParams().get("next") ?? "";
  const [state, action, pending] = useActionState(signIn, initialState);
  const t = useT("signIn");
  const invalid = state.error ? true : undefined;

  return (
    <form action={action} className="flex flex-col gap-4" aria-describedby={state.error ? "sign-in-error" : undefined}>
      <input type="hidden" name="next" value={next} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">{t("email")}</Label>
        <Input
          key={state.email ?? ""}
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          defaultValue={state.email}
          aria-invalid={invalid}
          className="h-9"
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">{t("password")}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={invalid}
          className="h-9"
          required
        />
      </div>
      {state.error ? (
        <p id="sign-in-error" role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
