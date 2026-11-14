/**
 * Database clients.
 *
 * - `getDb()` connects as the database owner and BYPASSES row-level security.
 *   Only Inngest jobs, seed scripts and evals may use it. Never call it from a
 *   route handler, server action, Copilot tool or Scout tool.
 * - `withUserDb()` (lib/db/user.ts) runs queries as the signed-in user, so
 *   row-level security decides every row. Requests use that one.
 */
import { getTableColumns, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
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

/** Every table's column names: changes when a column is added, renamed or removed. */
const schemaShape = JSON.stringify(
  Object.entries(schema).flatMap(([name, table]) => (is(table, PgTable) ? [[name, Object.keys(getTableColumns(table))]] : [])),
);

const globalForDb = globalThis as unknown as { __vspDb?: Db; __vspDbShape?: string };

/** Service client: bypasses RLS. Jobs and scripts only. Connects on first use. */
export function getDb(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. See .env.example.");
  // `next dev` reloads this module after a schema edit, but the client on
  // globalThis would keep the old column names: connect again.
  if (globalForDb.__vspDb && globalForDb.__vspDbShape !== schemaShape) {
    void globalForDb.__vspDb.$client.end();
    globalForDb.__vspDb = undefined;
  }
  globalForDb.__vspDb ??= connect(url);
  globalForDb.__vspDbShape = schemaShape;
  return globalForDb.__vspDb;
}

/** Close the shared connection, so scripts can exit. */
export async function closeDb() {
  await globalForDb.__vspDb?.$client.end();
  globalForDb.__vspDb = undefined;
}
