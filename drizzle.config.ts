import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  casing: "snake_case",
  dbCredentials: {
    // Local default is the Supabase CLI database (`npm run supabase:start`).
    url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  },
  // Supabase owns these schemas; never touch them.
  schemaFilter: ["public"],
  strict: true,
  verbose: true,
});
