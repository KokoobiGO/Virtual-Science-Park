/**
 * One test call per hosted service (S2).
 *
 *   npm run check:services
 *
 * Reads .env.local. A service whose variables are empty is reported as
 * SKIPPED rather than failed, so it is clear what is still missing. Nothing
 * here costs money except one tiny embedding call to Voyage.
 */
import { createClient } from "@supabase/supabase-js";
import { sql } from "drizzle-orm";
import { closeDb, getDb } from "../lib/db";
import { inngest } from "../lib/inngest/client";
import { getAnthropic } from "../lib/model";
import { VOYAGE_MODEL, voyageBaseUrl, voyageEmbed } from "../lib/voyage";
import { RESEND_TEST_INBOX, sendEmail } from "../lib/resend";

type Status = "PASS" | "FAIL" | "SKIPPED";
type Result = { service: string; status: Status; detail: string };

const env = (name: string) => process.env[name]?.trim() || undefined;

async function check(service: string, needs: string[], run: () => Promise<string>): Promise<Result> {
  const missing = needs.filter((n) => !env(n));
  if (missing.length) return { service, status: "SKIPPED", detail: `set ${missing.join(", ")}` };
  try {
    return { service, status: "PASS", detail: await run() };
  } catch (error) {
    return { service, status: "FAIL", detail: (error as Error).message };
  }
}

async function main() {
  const results: Result[] = [];

  results.push(
    await check("Anthropic", ["ANTHROPIC_API_KEY"], async () => {
      const page = await getAnthropic().models.list({ limit: 5 });
      return `key works, ${page.data.length} models listed (spend limit: check the Console by hand)`;
    }),
  );

  results.push(
    await check("Voyage AI", ["VOYAGE_API_KEY"], async () => {
      const [vector] = await voyageEmbed(["Undervattenssensorer för sjöbevakning"]);
      return `${VOYAGE_MODEL} returned a ${vector.length}-dimension vector from ${new URL(voyageBaseUrl()).host}`;
    }),
  );

  results.push(
    await check("Supabase API", ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY"], async () => {
      const url = env("NEXT_PUBLIC_SUPABASE_URL")!;
      const publicClient = createClient(url, env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")!, { auth: { persistSession: false } });
      const { error } = await publicClient.from("source_status").select("source").limit(1);
      if (error) throw new Error(`publishable key: ${error.message}`);
      const admin = createClient(url, env("SUPABASE_SECRET_KEY")!, { auth: { persistSession: false } });
      const { data, error: adminError } = await admin.auth.admin.listUsers({ perPage: 1 });
      if (adminError) throw new Error(`secret key: ${adminError.message}`);
      return `both keys work at ${new URL(url).host} (${data.users.length ? "has users" : "no users yet"})`;
    }),
  );

  results.push(
    await check("Database (Drizzle)", ["DATABASE_URL"], async () => {
      const [row] = await getDb().execute<{ vector: string | null; tables: number }>(sql`
        select
          (select extversion from pg_extension where extname = 'vector') as vector,
          (select count(*)::int from information_schema.tables where table_schema = 'public') as tables
      `);
      if (!row.vector) throw new Error("pgvector is not enabled; run npm run db:migrate");
      return `pgvector ${row.vector}, ${row.tables} tables in public`;
    }),
  );

  results.push(
    env("INNGEST_DEV") === "1"
      ? await check("Inngest (dev server)", [], async () => {
          const res = await fetch("http://127.0.0.1:8288/health").catch(() => null);
          if (!res?.ok) throw new Error("dev server not running; start it with npm run inngest:dev");
          const { ids } = await inngest.send({ name: "app/heartbeat.requested", data: { from: "check:services" } });
          return `event sent to the dev server (${ids[0]})`;
        })
      : await check("Inngest Cloud", ["INNGEST_EVENT_KEY", "INNGEST_SIGNING_KEY"], async () => {
          const { ids } = await inngest.send({ name: "app/heartbeat.requested", data: { from: "check:services" } });
          return `event accepted by Inngest Cloud (${ids[0]})`;
        }),
  );

  results.push(
    await check("Resend", ["RESEND_API_KEY"], async () => {
      // Resend's test inbox: nothing reaches a person.
      const { id } = await sendEmail({
        to: [RESEND_TEST_INBOX],
        subject: "Service check",
        text: "Sent by npm run check:services.",
      });
      return `test email accepted (${id})`;
    }),
  );

  results.push(
    await check("Vercel deployment", ["APP_URL"], async () => {
      const res = await fetch(env("APP_URL")!, { redirect: "follow" });
      if (!res.ok) throw new Error(`${res.status} from ${env("APP_URL")}`);
      return `${env("APP_URL")} answered ${res.status}`;
    }),
  );

  const width = Math.max(...results.map((r) => r.service.length));
  for (const r of results) console.log(`${r.status.padEnd(7)} ${r.service.padEnd(width)}  ${r.detail}`);
  if (results.some((r) => r.status === "FAIL")) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeDb);
