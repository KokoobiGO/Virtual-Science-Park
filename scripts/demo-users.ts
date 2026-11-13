/**
 * Create or refresh the demo accounts (S7): one member per gold company and
 * one BSP staff user.
 *
 *   npm run db:demo-users      (after npm run db:seed)
 *
 * The role and company go in app_metadata, which users cannot edit and which
 * Supabase copies into every access token; the RLS policies read it from there.
 * The password comes from DEMO_USER_PASSWORD, so it never lives in the repo.
 */
import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "../lib/db";
import { companies } from "../lib/db/schema";
import { AppMetadata } from "../lib/schemas";
import { DEMO_ACCOUNTS } from "../lib/demo-accounts";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. See .env.example.`);
  return value;
}

async function main() {
  const password = required("DEMO_USER_PASSWORD");
  if (password.length < 12) throw new Error("DEMO_USER_PASSWORD must be at least 12 characters.");

  const supabase = createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SECRET_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Look up existing users once; the demo project is small.
  const { data: list, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listError) throw listError;
  const existing = new Map(list.users.map((u) => [u.email?.toLowerCase(), u.id]));

  for (const account of DEMO_ACCOUNTS) {
    let appMetadata: AppMetadata;
    if (account.role === "member") {
      const [company] = await getDb()
        .select({ id: companies.id })
        .from(companies)
        .where(eq(companies.slug, account.companySlug));
      if (!company) throw new Error(`Company "${account.companySlug}" is missing. Run npm run db:seed first.`);
      appMetadata = { role: "member", company_id: company.id };
    } else {
      appMetadata = { role: "staff" };
    }
    AppMetadata.parse(appMetadata);

    const attributes = {
      password,
      email_confirm: true,
      app_metadata: appMetadata,
      user_metadata: { display_name: account.displayName },
    };
    const id = existing.get(account.email);
    const { error } = id
      ? await supabase.auth.admin.updateUserById(id, attributes)
      : await supabase.auth.admin.createUser({ email: account.email, ...attributes });
    if (error) throw error;
    console.log(`${id ? "Updated" : "Created"} ${account.email} (${account.role})`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeDb);
