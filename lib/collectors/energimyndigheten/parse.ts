/**
 * Energimyndigheten's calls ("utlysningar") as opportunities (A10).
 *
 * The list on https://www.energimyndigheten.se/utlysningar/ comes from a JSON
 * endpoint the page's own script posts to. Tab 0 ("Aktuella") is every call
 * that is open now, newest first. The list has no opening date, so `opensAt`
 * is left out; the teaser (IntroText) is the description.
 */
import * as cheerio from "cheerio/slim";
import type { CollectedOpportunity } from "../types";

export const SITE = "https://www.energimyndigheten.se";
export const LIST_URL = `${SITE}/utlysningar/GetProclamationItemsJson/`;

/** One call as the endpoint lists it. Only the fields we read; dates look like "/Date(1797375540000)/". */
export type EnergimyndighetenCall = {
  Headline?: string | null;
  IntroText?: string | null;
  IntroTextHtml?: { Fragments?: { InternalFormat?: string | null }[] | null } | null;
  ItemUrl?: string | null;
  StartPublishDate?: string | null;
  DeadlineForApplications?: string | null;
};

export type EnergimyndighetenResponse = { Items: EnergimyndighetenCall[]; HasMore?: boolean };

const MAX_DESCRIPTION = 4000;

/** "/Date(1797375540000)/" (milliseconds since 1970, UTC) to an ISO date-time. Empty or year-0 dates give undefined. */
export function msDate(value: string | null | undefined): string | undefined {
  const ms = value?.match(/^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/)?.[1];
  if (!ms || Number(ms) <= 0) return undefined;
  return new Date(Number(ms)).toISOString();
}

/** HTML or text to one line of plain text: tags gone, entities decoded, whitespace squashed. */
function plainText(html: string): string {
  const $ = cheerio.load(html);
  $("br, p, div, li, h1, h2, h3, h4, h5, h6").before(" ").after(" ");
  return $.root()
    .text()
    .normalize("NFC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function description(call: EnergimyndighetenCall): string | undefined {
  const html = call.IntroTextHtml?.Fragments?.map((f) => f.InternalFormat ?? "").join(" ") ?? "";
  const text = plainText(call.IntroText?.trim() ? call.IntroText : html);
  if (!text) return undefined;
  return text.length > MAX_DESCRIPTION ? `${text.slice(0, MAX_DESCRIPTION - 1).trimEnd()}\u2026` : text;
}

/** The call's page as an absolute https URL ("/utlysningar/x/" is on the site), or null when it is not a web address. */
function pageUrl(itemUrl: string): URL | null {
  let url: URL;
  try {
    url = new URL(itemUrl, SITE);
  } catch {
    return null;
  }
  if (url.protocol === "http:") url.protocol = "https:";
  return url.protocol === "https:" ? url : null;
}

/** The calls whose deadline is still ahead of `now`. Calls without a deadline are left out. */
export function parseEnergimyndigheten(data: EnergimyndighetenResponse, now: Date): CollectedOpportunity[] {
  const items: CollectedOpportunity[] = [];
  const seen = new Set<string>();

  for (const call of data.Items ?? []) {
    const title = plainText(call.Headline ?? "");
    const deadline = msDate(call.DeadlineForApplications);
    if (!title || !call.ItemUrl || !deadline || new Date(deadline) <= now) continue;

    const url = pageUrl(call.ItemUrl);
    if (!url) continue;
    const onSite = url.host === new URL(SITE).host;
    const externalId = onSite ? url.pathname : url.href;
    if (seen.has(externalId)) continue;
    seen.add(externalId);

    const publishedAt = msDate(call.StartPublishDate);
    const text = description(call);
    items.push({
      externalId,
      kind: "funding",
      title,
      url: url.href,
      ...(text ? { description: text } : {}),
      ...(publishedAt ? { publishedAt } : {}),
      deadline,
    });
  }
  return items;
}
