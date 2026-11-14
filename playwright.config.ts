import { defineConfig, devices } from "@playwright/test";
import { MEMBER_STATE, STAFF_STATE } from "./e2e/helpers";

/**
 * The automated demo run (D13). Run it with `npm run e2e`, which loads
 * .env.local so the sign-in step gets DEMO_USER_PASSWORD from the environment.
 *
 * It uses the server that is already running (BASE_URL, default the local dev
 * server) and never starts its own. Traces and videos are off on purpose: a
 * trace records request headers and typed values, which would put the session
 * cookie or the password into a file. Screenshots are taken only on failure.
 */
const baseURL = process.env.BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  // One worker, in file order: the run shares real data and a rate-limited model with other people.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // The dev server compiles a page on its first visit, which can take a while.
  timeout: 120_000,
  expect: { timeout: 20_000 },
  outputDir: "test-results",
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
    ["json", { outputFile: "test-results/results.json" }],
  ],
  use: {
    baseURL,
    trace: "off",
    video: "off",
    screenshot: "only-on-failure",
    acceptDownloads: true,
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts$/ },
    {
      name: "member",
      testMatch: /member\.spec\.ts$/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: MEMBER_STATE },
    },
    {
      name: "staff",
      testMatch: /staff\.spec\.ts$/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: STAFF_STATE },
    },
    {
      name: "phone",
      testMatch: /phone\.spec\.ts$/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 }, storageState: MEMBER_STATE },
    },
    {
      name: "wording",
      testMatch: /wording\.spec\.ts$/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"] },
    },
    // Copilot side panel, not-found pages, language switch: each describe picks its role.
    {
      name: "site",
      testMatch: /site\.spec\.ts$/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"] },
    },
    // One h1, named buttons and links, labelled fields, on every page the suite visits.
    {
      name: "a11y",
      testMatch: /a11y\.spec\.ts$/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
