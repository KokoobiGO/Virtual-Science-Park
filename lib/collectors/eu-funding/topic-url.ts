/**
 * The public page of an EU Funding & Tenders topic (A11, A20).
 *
 * Checked 2026-11-14 on 129 live topics: the search API's own `url` and
 * `esST_URL` fields are exactly TOPIC_PAGE + the identifier, so that is the
 * link we store. The identifier goes in as it is, case and suffix included:
 * "HORIZON-CL6-2027-01-CIRCBIO-01-two-stage" and
 * "HORIZON-CL6-2027-01-CIRCBIO-01" are two different topics (one in the
 * two-stage call, one in the single-stage call), each with its own page.
 *
 * The portal page is an app: it answers 200 for any id (a missing topic shows
 * "There is no data yet to be displayed"), and now and then it redirects a
 * good topic to commission.europa.eu/funding-tenders/opportunities/data/
 * topicDetails/<id>.html, which answers 404 for every topic. Neither says
 * whether the topic exists, so the link checker asks the search API instead
 * (lookupEuTopics in ./api).
 */

const TOPIC_PAGE = "https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/";
const TOPIC_PATH = new URL(TOPIC_PAGE).pathname;

/** The topic's page on the portal. */
export function euTopicUrl(identifier: string): string {
  return TOPIC_PAGE + encodeURIComponent(identifier);
}

/** The topic identifier in a portal topic link, or null when the URL is not one. */
export function euTopicIdFromUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.hostname !== "ec.europa.eu" || !parsed.pathname.startsWith(TOPIC_PATH)) return null;
  // One path segment; the app's own links sometimes add ";callCode=..." after the id.
  const segment = parsed.pathname.slice(TOPIC_PATH.length).replace(/\/$/, "").split(";")[0];
  if (!segment || segment.includes("/")) return null;
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}
