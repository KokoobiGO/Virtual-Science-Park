/**
 * The last check before a brief is "Done" (B3): every cited link is checked
 * live, with the same checker as the weekly link report (lib/links, A20).
 *
 * - ok: the page answered (after redirects), or for an EU portal topic, the
 *   portal's search API still lists the topic. The portal page itself answers
 *   200 for any id and now and then redirects a good topic to a 404 page, so
 *   its HTTP answer proves nothing either way (lib/collectors/eu-funding/topic-url.ts).
 * - broken: the page is gone (404, 410, a missing host...). The option is
 *   left out of the brief.
 * - blocked / unverifiable: the site will not tell a script; the option stays
 *   and the page says the link is not confirmed.
 * - unchecked: no answer inside the time budget, or the check failed. The
 *   option stays, labelled the same way.
 *
 * One Inngest step may take 30 s at most on Netlify, so the whole check gets
 * LINK_CHECK_BUDGET_MS and each request a shorter limit.
 */
import { checkLinks, type CheckOptions, type LinkResult } from "../links/check";
import type { LinkOutcome } from "../links/classify";

/** The whole check, inside one job step. */
export const LINK_CHECK_BUDGET_MS = 20_000;

const SCOUT_LINK_OPTIONS: CheckOptions = { timeoutMs: 8_000, retryDelayMs: 1_000, maxConcurrent: 8, maxPerHost: 3 };

export type CheckedLink = { url: string; outcome: LinkOutcome | "unchecked"; reason: string };

/** Checks the URLs; every URL gets a result, "unchecked" when none came in time. */
export async function checkCitedLinks(
  urls: readonly string[],
  options: { budgetMs?: number; check?: typeof checkLinks; checkOptions?: CheckOptions } = {},
): Promise<CheckedLink[]> {
  const unique = [...new Set(urls)];
  const done = new Map<string, LinkResult>();
  const check = options.check ?? checkLinks;
  const budgetMs = options.budgetMs ?? LINK_CHECK_BUDGET_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const outOfTime = new Promise<"time">((resolve) => {
    timer = setTimeout(() => resolve("time"), budgetMs);
  });
  try {
    await Promise.race([check(unique, { ...SCOUT_LINK_OPTIONS, ...options.checkOptions, onResult: (r) => done.set(r.url, r) }), outOfTime]);
  } finally {
    clearTimeout(timer);
  }
  return unique.map((url) => {
    const result = done.get(url);
    if (!result) return { url, outcome: "unchecked" as const, reason: `no answer within ${budgetMs >= 1000 ? `${Math.round(budgetMs / 1000)} s` : `${budgetMs} ms`}` };
    return { url, outcome: result.outcome, reason: result.reason };
  });
}
