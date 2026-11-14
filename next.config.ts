import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Files a route reads from disk at request time (readFile, not import).
  // Netlify's server function only gets the files the build traces, so name
  // them here, keyed by route. A file that does not exist yet (the two
  // results files) is simply not shipped; the page then says "not measured
  // yet". Imported JSON (data/*.json, recorded.json, scout briefs) is bundled
  // and needs no entry. See docs/deploy-checklist.md.
  outputFileTracingIncludes: {
    "/trust": ["./data/timed-test/results.json", "./data/staff-session/results.json"],
    "/staff/injection-demo": ["./data/injection-demo/result.json"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
