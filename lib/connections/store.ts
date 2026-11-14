/**
 * Stores the connection finder's result (A28). Jobs and scripts only: it
 * writes with getDb(), which bypasses row-level security.
 *
 * The pairs that passed are upserted on the pair. Every other stored pair is
 * deleted, in the same transaction, so the table always shows the latest run.
 */
import { desc, eq, notInArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "../db";
import { companies, connections } from "../db/schema";
import type { ConnectionEvidence } from "./verify";

export type ConnectionToStore = {
  companyAId: string;
  companyBId: string;
  /** The pair's cosine similarity. */
  score: number;
  basis: string;
  sharedOn: string[];
  evidence: ConnectionEvidence[];
};

export type StoredConnections = { stored: number; deleted: number };

export async function storeConnections(rows: readonly ConnectionToStore[]): Promise<StoredConnections> {
  for (const row of rows) {
    if (!(row.companyAId < row.companyBId)) throw new Error(`A pair is stored with the smaller id first: ${row.companyAId}, ${row.companyBId}.`);
  }
  const computedAt = new Date();

  return getDb().transaction(async (tx) => {
    const ids: string[] = [];
    for (const row of rows) {
      const [saved] = await tx
        .insert(connections)
        .values({ ...row, computedAt })
        .onConflictDoUpdate({
          target: [connections.companyAId, connections.companyBId],
          set: { basis: row.basis, sharedOn: row.sharedOn, score: row.score, evidence: row.evidence, computedAt },
        })
        .returning({ id: connections.id });
      ids.push(saved.id);
    }
    // Pairs an earlier run stored and this run did not confirm.
    const deleted = await tx
      .delete(connections)
      .where(ids.length ? notInArray(connections.id, ids) : undefined)
      .returning({ id: connections.id });
    return { stored: ids.length, deleted: deleted.length };
  });
}

export type StoredConnection = {
  companyAId: string;
  companyBId: string;
  companyA: string;
  companyB: string;
  score: number;
  sharedOn: string[];
  basis: string;
  evidence: ConnectionEvidence[];
  computedAt: Date;
};

/** The stored pairs with both names, the highest score first. */
export async function listStoredConnections(): Promise<StoredConnection[]> {
  const a = alias(companies, "company_a");
  const b = alias(companies, "company_b");
  return getDb()
    .select({
      companyAId: connections.companyAId,
      companyBId: connections.companyBId,
      companyA: a.name,
      companyB: b.name,
      score: connections.score,
      sharedOn: connections.sharedOn,
      basis: connections.basis,
      evidence: connections.evidence,
      computedAt: connections.computedAt,
    })
    .from(connections)
    .innerJoin(a, eq(a.id, connections.companyAId))
    .innerJoin(b, eq(b.id, connections.companyBId))
    .orderBy(desc(connections.score));
}
