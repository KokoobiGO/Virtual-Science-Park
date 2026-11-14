import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { SCORE_WEIGHTS } from "../schemas";
import { rankingQuery } from "./rank";

const dialect = new PgDialect({ casing: "snake_case" });
const COMPANY = "af4b032d-6fc3-46d3-bd9b-2d376a854440";
const NOW = new Date("2026-11-14T12:00:00Z");
const render = (mode: "personal" | "public") => dialect.sqlToQuery(rankingQuery(COMPANY, mode, { now: NOW }));

/** Table names the public ranking must never read. */
const PRIVATE_TABLES = /\b(company_private|feedback|saved_items)\b/;

describe("rankingQuery", () => {
  it("never reads private tables in public mode", () => {
    const { sql } = render("public");
    expect(sql).not.toMatch(PRIVATE_TABLES);
    expect(sql).toContain("public_embedding");
    expect(sql).not.toContain("personal_embedding");
  });

  it("reads the private embedding, priorities, feedback and saved items in personal mode", () => {
    const { sql } = render("personal");
    for (const table of ["company_private", "personal_embedding", "user_priorities", "feedback f", "saved_items s"]) {
      expect(sql).toContain(table);
    }
  });

  it("takes the average similarity to all companies from public embeddings in both modes", () => {
    for (const mode of ["personal", "public"] as const) {
      expect(render(mode).sql).toContain("avg(l2_normalize(public_embedding)) as v from companies where public_embedding is not null");
    }
  });

  it("passes the weights in as parameters, not as SQL text", () => {
    for (const mode of ["personal", "public"] as const) {
      const { sql, params } = render(mode);
      for (const weight of Object.values(SCORE_WEIGHTS)) {
        expect(params).toContain(weight);
        expect(sql).not.toContain(String(weight));
      }
    }
  });

  it("passes the company, the moment and the limit as parameters", () => {
    const { params } = dialect.sqlToQuery(rankingQuery(COMPANY, "public", { now: NOW, limit: 5 }));
    expect(params).toContain(COMPANY);
    expect(params).toContain(NOW.toISOString());
    expect(params).toContain(5);
  });

  it("refuses a limit that is not a positive whole number", () => {
    expect(() => rankingQuery(COMPANY, "public", { limit: 0 })).toThrow(/limit/);
    expect(() => rankingQuery(COMPANY, "public", { limit: 2.5 })).toThrow(/limit/);
  });
});
