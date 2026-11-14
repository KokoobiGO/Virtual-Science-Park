/**
 * Links whose HTTP answer says nothing about the page, and what the link
 * checker (A20) does with them instead. Pure: no network.
 *
 * - EU Funding & Tenders topic pages: the portal is an app that answers 200
 *   for any topic id, and now and then it redirects a good topic to a data
 *   page that answers 404. So the topic's identifier is looked up in the
 *   portal's search API, the one the EU collector uses: found is ok, not found
 *   is broken.
 * - Hosts in CANNOT_VERIFY answer 200 whether the page exists or not, so their
 *   links are "cannot verify by script" (outcome "unverifiable"), with the
 *   reason, and are not requested at all.
 */
import { euTopicIdFromUrl } from "../collectors/eu-funding/topic-url";
import type { Verdict } from "./classify";

/**
 * Host (without "www.") to the reason a script cannot verify its links.
 * Checked 2026-11-14 with a made-up path on every host the stored links use:
 * these two answered 200, every other host answered 404 (vinnova.se redirects
 * to /404, which check.ts catches). Subdomains are not included:
 * astazero.ri.se answers a missing page with 404.
 */
export const CANNOT_VERIFY: Readonly<Record<string, string>> = {
  "ri.se": "ri.se answers every address, a missing page too, with 200 and a bot check (\"Verifying you are not a robot\"); check in a browser",
  "energimyndigheten.se": "energimyndigheten.se answers a missing page with 200 (its not-found page), so a 200 proves nothing; check in a browser",
};

export type SourceRule = { kind: "eu_topic"; id: string } | { kind: "cannot_verify"; reason: string };

/** How this link must be checked, or null for the plain HTTP check. */
export function sourceRule(url: string): SourceRule | null {
  const id = euTopicIdFromUrl(url);
  if (id) return { kind: "eu_topic", id };
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
  const reason = CANNOT_VERIFY[host];
  return reason ? { kind: "cannot_verify", reason } : null;
}

export const EU_TOPIC_FOUND = "topic found in the portal API";

/** The verdict on an EU topic link, once the portal API has said which identifiers it knows. */
export function euTopicVerdict(id: string, found: ReadonlySet<string>): Verdict {
  return found.has(id)
    ? { outcome: "ok", reason: EU_TOPIC_FOUND }
    : { outcome: "broken", reason: "topic not found in the portal API (the portal page itself answers 200 for any id)" };
}

/** The verdict on an EU topic link when the portal API could not be asked. */
export function euLookupFailed(detail: string): Verdict {
  return { outcome: "blocked", reason: `could not ask the portal API (${detail}); the portal page answers 200 for any id, so check by hand` };
}
