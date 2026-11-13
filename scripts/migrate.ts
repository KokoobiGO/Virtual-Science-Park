/**
 * Apply the migrations in drizzle/ to DATABASE_URL.
 *
 *   npm run db:migrate
 *
 * Locally that is the Supabase CLI database; for the hosted project, set
 * DATABASE_URL to its session-pooler connection string.
 */
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { closeDb, getDb } from "../lib/db";

async function main() {
  const started = Date.now();
  await migrate(getDb(), { migrationsFolder: "drizzle" });
  console.log(`Migrations applied in ${Date.now() - started} ms.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeDb);
