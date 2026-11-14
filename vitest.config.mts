import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Integration tests read the same variables as the app. They skip themselves
// when the variables are missing (as in CI), so unit tests always run.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: integration tests will skip.
}

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**", ".claude/**"],
    environment: "node",
    testTimeout: 20_000,
  },
});
