"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { HOME } from "@/lib/navigation";
import { AppMetadata } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

/** `email` is echoed back so the form keeps it after a failed attempt. */
export type SignInState = { error: string | null; email?: string };

const SignInInput = z.object({
  email: z.email(),
  password: z.string().min(1),
  // Only same-site paths, so the form cannot be used as an open redirect.
  next: z
    .string()
    .regex(/^\/(?!\/)/)
    .optional()
    .catch(undefined),
});

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const typedEmail = String(formData.get("email") ?? "");
  const input = SignInInput.safeParse(Object.fromEntries(formData));
  if (!input.success) return { error: "Enter your email and password.", email: typedEmail };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: input.data.email,
    password: input.data.password,
  });
  if (error || !data.user) return { error: "Wrong email or password.", email: typedEmail };

  const metadata = AppMetadata.safeParse(data.user.app_metadata);
  if (!metadata.success) {
    await supabase.auth.signOut({ scope: "local" });
    return { error: "This account has no role yet. Ask BSP staff to set it up." };
  }

  redirect(input.data.next ?? HOME[metadata.data.role]);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/");
}
