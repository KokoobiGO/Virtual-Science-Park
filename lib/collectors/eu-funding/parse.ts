/**
 * Turn EU search hits into opportunities (A11). Pure: `now` decides what is
 * still open, so tests can fix it.
 */
// "cheerio/slim", not "cheerio": the full entry loads undici 7, which takes
// over Node's fetch and can crash the process on large responses.
import { load } from "cheerio/slim";
import type { CollectedOpportunity } from "../types";
import { EU_STATUS, type EuSearchHit } from "./api";

/** At most this many topics are kept, the nearest deadlines first. */
export const MAX_TOPICS = 150;
const MAX_DESCRIPTION = 4000;
const TOPIC_PAGE = "https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/";

export function parseEuFunding(hits: EuSearchHit[], now: Date, limit = MAX_TOPICS): CollectedOpportunity[] {
  const byId = new Map<string, CollectedOpportunity>();
  for (const hit of hits) {
    const item = toOpportunity(hit, now);
    if (item && !byId.has(item.externalId)) byId.set(item.externalId, item);
  }
  return [...byId.values()].sort(nearestFirst).slice(0, limit);
}

/** The opportunity, or null when the topic is not open or forthcoming any more. */
function toOpportunity(hit: EuSearchHit, now: Date): CollectedOpportunity | null {
  const meta: EuSearchHit["metadata"] = hit.metadata ?? {};
  const id = meta.identifier?.[0]?.trim();
  const title = squash(meta.title?.[0] ?? hit.summary ?? "");
  // Withdrawn topics keep their status; only the identifier says so.
  if (!id || !title || /-CANCELLED$/i.test(id)) return null;

  const opensAt = toDay(meta.startDate?.[0]);
  const deadlines = (meta.deadlineDate ?? []).map(toDay).filter((day): day is string => !!day);
  // Several cut-offs: the next one that has not passed.
  const deadline = deadlines.sort().find((day) => endOfDay(day) > now);
  if (!deadline) {
    // No cut-off left. Keep only a forthcoming topic that has no deadline yet and opens later.
    const forthcoming = meta.status?.[0] === EU_STATUS.forthcoming;
    if (deadlines.length > 0 || !forthcoming || !opensAt || endOfDay(opensAt) <= now) return null;
  }

  // A few topics (the EIC ones) have no text; the type of action at least says what they are.
  const description = clip(toPlainText(meta.descriptionByte?.[0] ?? ""), MAX_DESCRIPTION) || squash(meta.typesOfAction?.join(", ") ?? "");

  return {
    externalId: id,
    kind: "funding",
    title,
    url: TOPIC_PAGE + encodeURIComponent(id),
    ...(description ? { description } : {}),
    ...(opensAt ? { opensAt } : {}),
    ...(deadline ? { deadline } : {}),
  };
}

/** Nearest deadline first; topics with no deadline yet last. */
function nearestFirst(a: CollectedOpportunity, b: CollectedOpportunity): number {
  const key = (item: CollectedOpportunity) => `${item.deadline ?? "9999-12-31"} ${item.opensAt ?? ""} ${item.externalId}`;
  return key(a).localeCompare(key(b));
}

/** "2027-10-07T00:00:00.000+0000" becomes "2027-10-07". The API's dates are calendar days. */
function toDay(value: string | undefined): string | undefined {
  return value?.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
}

/** A deadline day closes at the end of the day, Swedish time, as storeCollected() reads it. */
function endOfDay(day: string): Date {
  return new Date(`${day}T23:59:00+01:00`);
}

/** HTML to one line of plain text: block tags become spaces, entities are decoded. */
export function toPlainText(html: string): string {
  const spaced = html
    .replace(/<[^>]*$/, "") // a tag cut off at the end
    .replace(/<(br|hr|\/?(p|div|li|ul|ol|h[1-6]|tr|td|th|table|section|blockquote))\b[^>]*>/gi, " ");
  return squash(load(spaced).text());
}

function squash(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
}
