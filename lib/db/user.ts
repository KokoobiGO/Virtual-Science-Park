/**
 * Run queries as the signed-in user, so row-level security decides every row.
 *
 * This is the database client for requests: route handlers, server actions and
 * the read-only Copilot and Scout tools. It opens a transaction, switches to the
 * `authenticated` role and sets the same JWT claims PostgREST would, so the
 * policies in drizzle/0002_rls.sql see exactly who is asking.
 *
 * Pass claims that Supabase has verified (`supabase.auth.getClaims()` on the
 * server, see lib/auth.ts). Never build them from anything the browser sent.
 */
import { sql } from "drizzle-orm";
import { getDb, type Db } from "./index";

export type JwtClaims = {
  sub: string;
  role?: string;
  app_metadata?: Record<string, unknown>;
  [claim: string]: unknown;
};

export type UserTx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export async function withUserDb<T>(claims: JwtClaims, run: (tx: UserTx) => Promise<T>): Promise<T> {
  if (!claims.sub) throw new Error("withUserDb needs verified claims with a subject.");
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`);
    await tx.execute(sql`set local role authenticated`);
    return run(tx);
  });
}
