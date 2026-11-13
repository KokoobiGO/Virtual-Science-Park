/**
 * Row-level security, tested the way the app reads data (S8).
 *
 * Needs a database with migrations, fixtures and demo users loaded:
 *   npm run supabase:start && npm run db:setup && npm test
 * Skips itself when the Supabase variables or DEMO_USER_PASSWORD are not set.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb } from "../lib/db";
import { withUserDb, type JwtClaims } from "../lib/db/user";
import { DEMO_ACCOUNTS } from "../lib/demo-accounts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const password = process.env.DEMO_USER_PASSWORD;
const configured = Boolean(url && publishableKey && secretKey && password && process.env.DATABASE_URL);

const emailFor = (who: "techinova" | "embeddedart" | "staff") =>
  DEMO_ACCOUNTS.find((a) => a.email.startsWith(`${who}@`))!.email;

function anonClient() {
  return createClient(url!, publishableKey!, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function signIn(email: string) {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email, password: password! });
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`);
  const { data, error: claimsError } = await client.auth.getClaims();
  if (claimsError || !data) throw new Error(`No claims for ${email}`);
  return { client, claims: data.claims as JwtClaims };
}

describe.skipIf(!configured)("row-level security", () => {
  let service: SupabaseClient;
  let techinova: Awaited<ReturnType<typeof signIn>>;
  let staff: Awaited<ReturnType<typeof signIn>>;
  let ids: Record<string, string>;
  let embeddedartChatId: string;

  beforeAll(async () => {
    service = createClient(url!, secretKey!, { auth: { persistSession: false } });
    const { data, error } = await service.from("companies").select("id, slug");
    if (error) throw error;
    ids = Object.fromEntries(data.map((c) => [c.slug, c.id]));

    techinova = await signIn(emailFor("techinova"));
    staff = await signIn(emailFor("staff"));

    // A private chat turn that belongs to EmbeddedArt.
    const { data: embeddedartUser } = await service.auth.admin.listUsers();
    const owner = embeddedartUser.users.find((u) => u.email === emailFor("embeddedart"))!;
    const { data: chat, error: chatError } = await service
      .from("chats")
      .insert({
        company_id: ids.embeddedart,
        user_id: owner.id,
        thread_id: crypto.randomUUID(),
        role: "user",
        content: "Privacy test: private question from EmbeddedArt",
      })
      .select("id")
      .single();
    if (chatError) throw chatError;
    embeddedartChatId = chat.id;
  });

  afterAll(async () => {
    if (embeddedartChatId) await service.from("chats").delete().eq("id", embeddedartChatId);
    await closeDb();
  });

  it("the fixtures contain private EmbeddedArt rows to hide", async () => {
    const { count } = await service
      .from("claims")
      .select("*", { count: "exact", head: true })
      .eq("company_id", ids.embeddedart)
      .eq("visibility", "private");
    expect(count).toBeGreaterThan(0);
  });

  describe("signed in as company A (Techinova)", () => {
    it("gets nothing back for company B's private claims", async () => {
      const { data, error } = await techinova.client
        .from("claims")
        .select("id")
        .eq("company_id", ids.embeddedart)
        .eq("visibility", "private");
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it("sees only company B's public claims", async () => {
      const { data } = await techinova.client.from("claims").select("visibility").eq("company_id", ids.embeddedart);
      expect(data!.length).toBeGreaterThan(0);
      expect(data!.every((c) => c.visibility === "public")).toBe(true);
    });

    it("gets nothing back for company B's private settings, matches or chats", async () => {
      const privateRow = await techinova.client.from("company_private").select("*").eq("company_id", ids.embeddedart);
      const theirMatches = await techinova.client.from("matches").select("id").eq("company_id", ids.embeddedart);
      const theirChats = await techinova.client.from("chats").select("id").eq("company_id", ids.embeddedart);
      expect(privateRow.data).toEqual([]);
      expect(theirMatches.data).toEqual([]);
      expect(theirChats.data).toEqual([]);
    });

    it("still sees its own private settings and personal matches", async () => {
      const own = await techinova.client.from("company_private").select("user_priorities").eq("company_id", ids.techinova);
      const personal = await techinova.client
        .from("matches")
        .select("id")
        .eq("company_id", ids.techinova)
        .eq("mode", "personal");
      expect(own.data).toHaveLength(1);
      expect(personal.data!.length).toBeGreaterThan(0);
    });

    it("cannot write a claim for company B", async () => {
      const { error } = await techinova.client.from("claims").insert({
        company_id: ids.embeddedart,
        field: "summary",
        value: "Injected",
        status: "user_corrected",
        confidence: 1,
        updated_by: "user",
      });
      expect(error).not.toBeNull();
    });

    it("gets the same answer through the Drizzle user client", async () => {
      const [row] = await withUserDb(techinova.claims, (tx) =>
        tx.execute<{ theirs: number; their_settings: number; own_settings: number }>(sql`
          select
            (select count(*)::int from claims where company_id = ${ids.embeddedart} and visibility = 'private') as theirs,
            (select count(*)::int from company_private where company_id = ${ids.embeddedart}) as their_settings,
            (select count(*)::int from company_private where company_id = ${ids.techinova}) as own_settings
        `),
      );
      expect(row).toEqual({ theirs: 0, their_settings: 0, own_settings: 1 });
    });
  });

  describe("signed in as BSP staff", () => {
    it("reads public matches only", async () => {
      const { data } = await staff.client.from("matches").select("mode");
      expect(data!.length).toBeGreaterThan(0);
      expect(data!.every((m) => m.mode === "public")).toBe(true);
    });

    it("never reads private claims, private settings or chats", async () => {
      const claims = await staff.client.from("claims").select("id").eq("visibility", "private");
      const settings = await staff.client.from("company_private").select("company_id");
      const chats = await staff.client.from("chats").select("id");
      expect(claims.data).toEqual([]);
      expect(settings.data).toEqual([]);
      expect(chats.data).toEqual([]);
    });
  });

  describe("signed out", () => {
    it("sees no company data but can read the data status", async () => {
      const client = anonClient();
      const companies = await client.from("companies").select("id");
      const status = await client.from("source_status").select("source");
      expect(companies.data).toEqual([]);
      expect(status.data!.length).toBeGreaterThan(0);
    });
  });
});
