/**
 * Tech Concept Lab events (A25): WordPress `event` posts to opportunities.
 *
 * The API has no event date field, so the date is read from the title, then
 * the text (./dates.ts). Events dated today or later are kept. A post with no
 * date in it is kept only while it is new (published in the last 45 days),
 * and says so at the start of its description.
 */
import type { OpportunityFormat } from "../../schemas";
import type { CollectedOpportunity } from "../types";
import { findEventDate, swedishDay } from "./dates";
import { clip, htmlToText, publishedDate, titleText, type WpPost } from "./wordpress";

export const UNDATED_DAYS = 45;
export const NO_DATE_PREFIX = "No date found in the text. ";

/** A cancelled event is not an opportunity: "(Canceled due to easter holidays) Future Lab Part 4". */
const CANCELLED = /\b(cancell?ed|inställ(?:t|d|da))\b/i;

const IN_PERSON = /\b(fysiskt|fysisk träff|på plats|on[- ]site|in[- ]person)\b/i;
/** Narrow on purpose: "digitalt" and "online" alone often describe something else ("digitalt stöd"). */
const ONLINE =
  /\b((?:hålls|sker|genomförs|sänds|delta) (?:digitalt|online)|digitalt (?:via|på)|online[- ](?:event|seminar|seminarium|workshop|meeting|möte)|webbinarium|webinar|via (?:teams|zoom)|(?:held|hosted|join us|takes place) online)\b/i;

/** Only when the text says it clearly; both kinds of wording, or the word hybrid, mean hybrid. */
export function detectFormat(text: string): OpportunityFormat | undefined {
  if (/\bhybrid\b/i.test(text)) return "hybrid";
  const inPerson = IN_PERSON.test(text);
  const online = ONLINE.test(text);
  if (inPerson && online) return "hybrid";
  if (inPerson) return "in_person";
  if (online) return "online";
  return undefined;
}

export function parseTclEvents(data: WpPost[], now: Date): CollectedOpportunity[] {
  const today = swedishDay(now);
  const undatedSince = now.getTime() - UNDATED_DAYS * 86_400_000;
  const dated: CollectedOpportunity[] = [];
  const undated: CollectedOpportunity[] = [];

  for (const post of data) {
    const title = titleText(post.title.rendered);
    if (!title || CANCELLED.test(title)) continue;
    const text = htmlToText(post.content.rendered);
    const published = publishedDate(post);
    const eventDate = findEventDate(title, published) ?? findEventDate(text, published);
    const format = detectFormat(text);
    const base = {
      externalId: String(post.id),
      kind: "event" as const,
      title,
      url: post.link,
      publishedAt: published.toISOString(),
      ...(format ? { format } : {}),
    };

    if (eventDate) {
      if (eventDate.slice(0, 10) < today) continue;
      dated.push({ ...base, description: clip(text), eventDate });
    } else if (published.getTime() >= undatedSince) {
      undated.push({ ...base, description: clip(NO_DATE_PREFIX + text) });
    }
  }

  dated.sort((a, b) => (a.eventDate ?? "").localeCompare(b.eventDate ?? ""));
  undated.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
  return [...dated, ...undated];
}
