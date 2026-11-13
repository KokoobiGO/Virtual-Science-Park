/**
 * Database clients.
 *
 * - `getDb()` connects as the database owner and BYPASSES row-level security.
 *   Only Inngest jobs, seed scripts and evals may use it. Never call it from a
 *   route handler, server action, Copilot tool or Scout tool.
 * - `withUserDb()` (lib/db/user.ts) runs queries as the signed-in user, so
 *   row-level security decides every row. Requests use that one.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export { schema };

function connect(url: string) {
  // `prepare: false` keeps it working behind Supabase's transaction pooler.
  const client = postgres(url, { prepare: false, max: 5 });
  return drizzle(client, { schema, casing: "snake_case" });
}

export type Db = ReturnType<typeof connect>;

const globalForDb = globalThis as unknown as { __vspDb?: Db };

/** Service client: bypasses RLS. Jobs and scripts only. Connects on first use. */
export function getDb(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. See .env.example.");
  globalForDb.__vspDb ??= connect(url);
  return globalForDb.__vspDb;
}

/** Close the shared connection, so scripts can exit. */
export async function closeDb() {
  await globalForDb.__vspDb?.$client.end();
  globalForDb.__vspDb = undefined;
}
