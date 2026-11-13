/**
 * Shared Claude settings (S3). Every agent takes its model IDs and tool
 * versions from here, so an upgrade is one edit.
 *
 * Checked against the live Claude docs on 2026-11-13; see "Claude API
 * versions" in the README. Run `npm run check:claude` to test each feature.
 */
import Anthropic from "@anthropic-ai/sdk";

export const MODELS = {
  /** Scope classifier, tagging: cheap and fast. */
  fast: "claude-haiku-5-5",
  /** Profiler, matcher judge, digest, Scout, Copilot. */
  main: "claude-sonnet-5-5",
} as const;

/**
 * Newest web search version. Adds dynamic filtering (from 20260209) and
 * `response_inclusion` (20260318) over the basic `web_search_20250305`.
 */
export const WEB_SEARCH_TOOL_TYPE = "web_search_20260318" as const;

/**
 * Server-side refusal fallback for Sonnet 5.5: with `fallbacks: "default"` a
 * declined request is retried on a fallback model inside the same call.
 * Beta, so it goes through `client.beta.messages`.
 */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01" as const;

export function webSearchTool(options: { maxUses: number; allowedDomains?: string[] }): Anthropic.WebSearchTool20260318 {
  return {
    type: WEB_SEARCH_TOOL_TYPE,
    name: "web_search",
    max_uses: options.maxUses,
    ...(options.allowedDomains ? { allowed_domains: options.allowedDomains } : {}),
  };
}

let client: Anthropic | undefined;

/**
 * One client per process. It talks to the public API unless
 * ANTHROPIC_API_BASE_URL says otherwise; the SDK's own ANTHROPIC_BASE_URL is
 * ignored on purpose, because developer tools sometimes set it for themselves.
 */
export function getAnthropic(): Anthropic {
  client ??= new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    baseURL: process.env.ANTHROPIC_API_BASE_URL || "https://api.anthropic.com",
  });
  return client;
}
