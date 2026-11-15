/**
 * The weekly digest email (C18): one company's "Your week" cards as an email.
 * Pure, so it is unit-tested. lib/email/load.ts reads the stored cards and
 * lib/email/send.ts sends the result.
 *
 * Plain email HTML: tables and inline styles, no images, no outside CSS. One
 * small <style> block adds dark mode and narrow-screen padding; a client that
 * drops it still shows a readable light email. Every text from the database
 * goes through escapeHtml(), and only http(s) addresses become links.
 *
 * No cards, no email: buildDigest() returns null for an empty week.
 *
 * Language (C19): the email's own words come from messages/*.json (`digest`)
 * in the `locale` the caller passes, English by default. Card titles, why,
 * next step, doubts, source names and company names are shown as stored.
 */
import { dataStatusName, dataStatusText, itemDataStatus, type DataStatusKind } from "../../components/data-status-label";
import { DEFAULT_LOCALE, type Locale } from "../i18n/config";
import { formatDay } from "../i18n/format";
import { createTranslator, MESSAGES, type Translator } from "../i18n/translate";
import type { OpportunityKind, SourceState } from "../schemas";
import { isWebLink, isWholeDay, sourceLabel, swedishTime } from "../week/format";

export type DigestOpportunity = {
  kind: OpportunityKind;
  /** Display name of the source, e.g. "Vinnova". */
  source: string;
  url: string;
  deadline: Date | null;
  eventDate: Date | null;
  /** opportunities.simulated: entered by hand by the team, or the team's sample data for a `fixture-` row. */
  simulated: boolean;
  /** opportunities.external_id: a `fixture-` row is the team's sample data, labelled Simulated. */
  externalId: string | null;
  /** The state of the opportunity's source (source_status, joined on its label); null without a row. */
  sourceState: SourceState | null;
  /** For a cached source: the date of the copy (or of the read from it). Null otherwise. */
  cachedAt: Date | null;
};

/** One stored week_cards row, with its opportunity (match cards) or trend area (trend cards). */
export type DigestCard = {
  position: number;
  kind: "match" | "trend";
  title: string;
  why: string;
  nextStep: string;
  uncertainties: string[];
  sources: { url: string; title?: string }[];
  opportunity: DigestOpportunity | null;
  /** The technology area of a trend card, e.g. "marine". */
  trendArea: string | null;
};

export type DigestInput = {
  companyName: string;
  /** The Monday the cards are for, YYYY-MM-DD (the `week_of` column). */
  weekOf: string;
  cards: readonly DigestCard[];
  /** The site's base URL, e.g. https://example.netlify.app; the email links to its /week page. */
  siteUrl: string;
  /** For "(passed)" on dates; defaults to now. */
  now?: Date;
  /**
   * The language of the email's own words (C19). English when left out: the
   * digest job sends English. Pass "sv" for a Swedish email.
   */
  locale?: Locale;
};

export type DigestEmail = { subject: string; html: string; text: string };

type T = Translator<"digest">;

/** Information-only notice, shared by the HTML and the text version. In English; messages/*.json `digest.notice`. */
export const DIGEST_NOTICE = MESSAGES.en.digest.notice;

/** The card labels every digest explains. */
function cardLabelMeanings(t: T): { label: string; meaning: string }[] {
  return (["match", "trend"] as const).map((kind) => ({ label: t(`cardLabels.${kind}.label`), meaning: t(`cardLabels.${kind}.meaning`) }));
}

/** The data label of a card's opportunity (D20, the same rule as on the screens), or null for one read live. */
export function opportunityDataStatus(o: DigestOpportunity): DataStatusKind | null {
  return itemDataStatus(o);
}

/** The words on the label: "Hand-entered", "Simulated", "Cached copy · 10 Nov 2026". */
function dataLabelText(o: DigestOpportunity, kind: DataStatusKind, locale: Locale): string {
  return dataStatusText(kind, kind === "cached" ? o.cachedAt : null, locale);
}

/**
 * How the data is labelled, shared by the HTML and the text version: the two
 * card labels, then each data label this email uses, with what it means.
 */
export function digestLabels(cards: readonly DigestCard[], locale: Locale = DEFAULT_LOCALE): { label: string; meaning: string }[] {
  const used = new Set(cards.map((c) => (c.opportunity ? opportunityDataStatus(c.opportunity) : null)));
  const data = (["hand_entered", "cached", "simulated"] as const)
    .filter((kind) => used.has(kind))
    .map((kind) => {
      const { label, description } = dataStatusName(kind, locale);
      return { label, meaning: `${description.charAt(0).toLowerCase()}${description.slice(1)}` };
    });
  return [...cardLabelMeanings(createTranslator(locale, "digest")), ...data];
}

/** The technology areas of trend cards with a display name; another area is shown as stored. */
const AREAS = MESSAGES.en.digest.areas;

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Text for HTML content and attribute values: no tag, attribute or entity can come through. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/** Escaped, with line breaks kept (trend notes have paragraphs). */
const escapeLines = (value: string) => escapeHtml(value.trim()).replace(/\r?\n/g, "<br>");

/** One line for a subject or a label: no line breaks, no runs of spaces. */
const oneLine = (value: string) => value.replace(/\s+/g, " ").trim();

/** The site's /week page. Throws for anything but an http(s) base URL. */
export function weekPageUrl(siteUrl: string): string {
  const url = new URL("/week", siteUrl);
  if (!isWebLink(url.href)) throw new Error(`The site URL must start with http:// or https://, got ${siteUrl}.`);
  return url.href;
}

/** "6 potential matches and a trend note", "a trend note", "1 potential match". */
export function countsText(cards: readonly DigestCard[], locale: Locale = DEFAULT_LOCALE): string {
  const t = createTranslator(locale, "digest");
  const matches = cards.filter((c) => c.kind === "match").length;
  const trends = cards.length - matches;
  const parts = [
    ...(matches ? [t("counts.matches", { count: matches })] : []),
    ...(trends ? [t("counts.trends", { count: trends })] : []),
  ];
  return parts.length === 2 ? t("counts.and", { first: parts[0], second: parts[1] }) : parts.join("");
}

function areaLabel(area: string | null, t: T): string | null {
  if (!area) return null;
  return Object.hasOwn(AREAS, area) ? t(`areas.${area as keyof typeof AREAS}`) : area;
}

/** The kind of opportunity: "Funding call", "Testbed" (as on Your week). */
const kindLabel = (kind: OpportunityKind, t: T) => t(`kinds.${kind}`);

/** "3 Dec 2026", or "3 Dec 2026, 14:00" when the source gives a time; Swedish time (as lib/week/format.ts formatWhen). */
function when(instant: Date, t: T): string {
  const day = formatDay(instant, t.locale);
  return isWholeDay(instant) ? day : t("when", { day, time: swedishTime(instant) });
}

/** The `week_of` date (a Monday, YYYY-MM-DD) as "9 Nov 2026". Noon UTC is the same day in Sweden. */
const weekLabel = (weekOf: string, locale: Locale) => formatDay(`${weekOf}T12:00:00Z`, locale);

type CardDate = { label: string; text: string; passed: boolean };

/** The dates a match card shows: the deadline and the event date, when the source gives them. */
function cardDates(card: DigestCard, now: Date, t: T): CardDate[] {
  const o = card.kind === "match" ? card.opportunity : null;
  if (!o) return [];
  const dates: CardDate[] = [];
  if (o.deadline) dates.push({ label: t("deadline"), text: when(o.deadline, t), passed: o.deadline < now });
  if (o.eventDate) dates.push({ label: t("eventDate"), text: when(o.eventDate, t), passed: o.eventDate < now });
  return dates;
}

type LabelStyle = "main" | "plain" | "simulated" | "cached";

/** The labels on a card, in order, e.g. ["Potential match", "Testbed", "Curated testbed list", "Hand-entered"]. */
function cardLabels(card: DigestCard, t: T): { text: string; style: LabelStyle }[] {
  if (card.kind === "trend") {
    const area = areaLabel(card.trendArea, t);
    return [{ text: t("cardLabels.trend.label"), style: "main" }, ...(area ? [{ text: area, style: "plain" as const }] : [])];
  }
  const o = card.opportunity;
  const status = o ? opportunityDataStatus(o) : null;
  return [
    { text: t("cardLabels.match.label"), style: "main" },
    ...(o ? [{ text: kindLabel(o.kind, t), style: "plain" as const }, { text: oneLine(o.source), style: "plain" as const }] : []),
    ...(o && status ? [{ text: dataLabelText(o, status, t.locale), style: status === "cached" ? ("cached" as const) : ("simulated" as const) }] : []),
  ];
}

const whyHeading = (card: DigestCard, t: T) => (card.kind === "trend" ? t("whyTrend") : t("whyMatch"));

/** The sources worth a link: http(s) only, each address once. */
function webSources(card: DigestCard): { url: string; label: string; host: string }[] {
  const seen = new Set<string>();
  return card.sources.flatMap((s) => {
    if (!isWebLink(s.url) || seen.has(s.url)) return [];
    seen.add(s.url);
    return [{ url: s.url, label: oneLine(sourceLabel(s)), host: new URL(s.url).hostname.replace(/^www\./, "") }];
  });
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** Light colours inline; the <style> block below swaps them in dark mode. */
const COLOR = {
  page: "#f3f4f6",
  card: "#ffffff",
  text: "#1f2328",
  muted: "#59636e",
  border: "#d9dde3",
  link: "#0b5cad",
  mainBg: "#e8f0fa",
  mainText: "#0b4a8b",
  mainBorder: "#c5d8ee",
  simBg: "#fff4e0",
  simText: "#8a4b00",
  simBorder: "#d9a75c",
  cacheBg: "#e7f5f2",
  cacheText: "#0d5c52",
  cacheBorder: "#8cc9bd",
  button: "#0b5cad",
  buttonText: "#ffffff",
} as const;

const STYLE = `
:root { color-scheme: light dark; supported-color-schemes: light dark; }
@media (prefers-color-scheme: dark) {
  .vsp-page { background-color: #111418 !important; }
  .vsp-card { background-color: #1b1f24 !important; border-color: #353b44 !important; }
  .vsp-rule { border-color: #353b44 !important; }
  .vsp-text { color: #e7eaee !important; }
  .vsp-muted { color: #a3abb5 !important; }
  .vsp-link { color: #78b6ff !important; }
  .vsp-main { background-color: #1d3550 !important; color: #cfe3ff !important; border-color: #2f4f75 !important; }
  .vsp-plain { color: #c5ccd5 !important; border-color: #3a414a !important; }
  .vsp-sim { background-color: #3a2a12 !important; color: #ffd28a !important; border-color: #8a6a3a !important; }
  .vsp-cache { background-color: #123a35 !important; color: #9fe3d4 !important; border-color: #2d6b60 !important; }
}
@media (max-width: 620px) {
  .vsp-outer { padding: 16px 8px !important; }
  .vsp-cardpad { padding: 16px !important; }
}`;

const textStyle = `margin:0;font-family:${FONT};font-size:16px;line-height:1.5;color:${COLOR.text};`;
const mutedStyle = `margin:0;font-family:${FONT};font-size:14px;line-height:1.5;color:${COLOR.muted};`;
const smallStyle = `margin:0;font-family:${FONT};font-size:13px;line-height:1.5;color:${COLOR.muted};`;
const linkStyle = `color:${COLOR.link};text-decoration:underline;word-break:break-word;`;

function link(href: string, label: string): string {
  return `<a class="vsp-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" style="${linkStyle}">${escapeHtml(label)}</a>`;
}

const BADGE_LOOK: Record<LabelStyle, { cls: string; css: string }> = {
  main: { cls: "vsp-main", css: `background-color:${COLOR.mainBg};color:${COLOR.mainText};border:1px solid ${COLOR.mainBorder};` },
  simulated: { cls: "vsp-sim", css: `background-color:${COLOR.simBg};color:${COLOR.simText};border:1px dashed ${COLOR.simBorder};` },
  cached: { cls: "vsp-cache", css: `background-color:${COLOR.cacheBg};color:${COLOR.cacheText};border:1px dashed ${COLOR.cacheBorder};` },
  plain: { cls: "vsp-plain", css: `color:${COLOR.muted};border:1px solid ${COLOR.border};` },
};

function badge({ text, style }: { text: string; style: LabelStyle }): string {
  const base = `display:inline-block;margin:0 6px 6px 0;padding:2px 8px;border-radius:10px;font-family:${FONT};font-size:12px;line-height:18px;font-weight:600;`;
  const look = BADGE_LOOK[style];
  return `<span class="${look.cls}" style="${base}${look.css}">${escapeHtml(text)}</span>`;
}

function section(heading: string, body: string): string {
  return (
    `<p class="vsp-muted" style="margin:16px 0 4px;font-family:${FONT};font-size:12px;line-height:1.4;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:${COLOR.muted};">${escapeHtml(heading)}</p>` +
    body
  );
}

function cardHtml(card: DigestCard, now: Date, t: T): string {
  const dates = cardDates(card, now, t);
  const sources = webSources(card);
  const parts = [
    `<p style="margin:0 0 4px;">${cardLabels(card, t).map(badge).join("")}</p>`,
    `<h2 class="vsp-text" style="margin:0;font-family:${FONT};font-size:18px;line-height:1.35;font-weight:600;color:${COLOR.text};">${escapeHtml(oneLine(card.title))}</h2>`,
    dates.length
      ? `<p class="vsp-muted" style="${mutedStyle}margin-top:6px;">${dates
          .map((d) => `${escapeHtml(d.label)}: <strong>${escapeHtml(d.text)}</strong>${d.passed ? ` ${escapeHtml(t("passed"))}` : ""}`)
          .join("<br>")}</p>`
      : "",
    section(whyHeading(card, t), `<p class="vsp-text" style="${textStyle}">${escapeLines(card.why)}</p>`),
    section(t("nextStep"), `<p class="vsp-text" style="${textStyle}">${escapeLines(card.nextStep)}</p>`),
    card.uncertainties.length
      ? section(
          t("uncertain"),
          `<ul style="margin:0;padding:0 0 0 20px;">${card.uncertainties
            .map((u) => `<li class="vsp-text" style="${textStyle}margin-bottom:4px;">${escapeHtml(oneLine(u))}</li>`)
            .join("")}</ul>`,
        )
      : "",
    sources.length
      ? section(
          t("sources", { count: sources.length }),
          sources
            .map(
              (s) =>
                `<p class="vsp-text" style="${textStyle}margin-bottom:4px;">${link(s.url, s.label)}${s.label === s.host ? "" : ` <span class="vsp-muted" style="color:${COLOR.muted};font-size:14px;">(${escapeHtml(s.host)})</span>`}</p>`,
            )
            .join(""),
        )
      : "",
  ];
  return (
    `<tr><td style="padding:0 0 16px 0;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="vsp-card" style="border-collapse:separate;background-color:${COLOR.card};border:1px solid ${COLOR.border};border-radius:8px;">` +
    `<tr><td class="vsp-cardpad" style="padding:20px;">${parts.join("")}</td></tr></table>` +
    `</td></tr>`
  );
}

function html({ subject, preheader, company, week, intro, cards, weekUrl, now, t }: {
  subject: string;
  preheader: string;
  company: string;
  week: string;
  intro: string;
  cards: readonly DigestCard[];
  weekUrl: string;
  now: Date;
  t: T;
}): string {
  const labels = digestLabels(cards, t.locale)
    .map((l) => `<strong>${escapeHtml(l.label)}</strong>: ${escapeHtml(l.meaning)}`)
    .join("<br>");
  return [
    "<!doctype html>",
    `<html lang="${t.locale}">`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="light dark">',
    '<meta name="supported-color-schemes" content="light dark">',
    `<title>${escapeHtml(subject)}</title>`,
    `<style>${STYLE}\n</style>`,
    "</head>",
    `<body class="vsp-page" style="margin:0;padding:0;background-color:${COLOR.page};">`,
    // The inbox preview line; hidden in the email itself.
    `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}</div>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="vsp-page" style="background-color:${COLOR.page};">`,
    `<tr><td align="center" class="vsp-outer" style="padding:24px 12px;">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">`,
    `<tr><td style="padding:0 4px 20px 4px;">`,
    `<p class="vsp-muted" style="${smallStyle}">Virtual Science Park</p>`,
    `<h1 class="vsp-text" style="margin:4px 0 0 0;font-family:${FONT};font-size:24px;line-height:1.3;font-weight:700;color:${COLOR.text};">${escapeHtml(t("heading", { company }))}</h1>`,
    `<p class="vsp-muted" style="${mutedStyle}margin-top:4px;">${escapeHtml(t("weekOf", { week }))}</p>`,
    `<p class="vsp-text" style="${textStyle}margin-top:16px;">${escapeHtml(intro)}</p>`,
    `</td></tr>`,
    ...cards.map((card) => cardHtml(card, now, t)),
    `<tr><td align="center" style="padding:8px 0 24px 0;">`,
    `<a href="${escapeHtml(weekUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 22px;border-radius:6px;background-color:${COLOR.button};color:${COLOR.buttonText};font-family:${FONT};font-size:16px;font-weight:600;line-height:1.2;text-decoration:none;">${escapeHtml(t("openWeek"))}</a>`,
    `<p class="vsp-muted" style="${mutedStyle}margin-top:10px;">${escapeHtml(t("saveHint"))}<br>${link(weekUrl, weekUrl)}</p>`,
    `</td></tr>`,
    `<tr><td class="vsp-rule" style="padding:16px 4px 0 4px;border-top:1px solid ${COLOR.border};">`,
    `<p class="vsp-muted" style="${smallStyle}">${escapeHtml(t("notice"))}</p>`,
    `<p class="vsp-muted" style="${smallStyle}margin-top:10px;">${escapeHtml(t("labelsTitle"))}<br>${labels}<br>${escapeHtml(t("swedishTime"))}</p>`,
    `<p class="vsp-muted" style="${smallStyle}margin-top:10px;">${escapeHtml(t("sentBy"))}</p>`,
    `</td></tr>`,
    "</table>",
    "</td></tr>",
    "</table>",
    "</body>",
    "</html>",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Text version
// ---------------------------------------------------------------------------

function cardText(card: DigestCard, number: number, now: Date, t: T): string {
  const dates = cardDates(card, now, t);
  const sources = webSources(card);
  const indent = (value: string) =>
    value
      .trim()
      .split(/\r?\n/)
      .map((line) => `   ${line.trim()}`)
      .join("\n");
  return [
    `${number}. ${oneLine(card.title)}`,
    `   ${cardLabels(card, t)
      .map((l) => l.text)
      .join(" | ")}`,
    ...dates.map((d) => `   ${d.label}: ${d.text}${d.passed ? ` ${t("passed")}` : ""}`),
    `   ${whyHeading(card, t)}:`,
    indent(card.why),
    `   ${t("nextStep")}:`,
    indent(card.nextStep),
    ...(card.uncertainties.length ? [`   ${t("uncertain")}:`, ...card.uncertainties.map((u) => `   - ${oneLine(u)}`)] : []),
    ...(sources.length ? [`   ${t("sources", { count: sources.length })}:`, ...sources.map((s) => `   ${s.label}: ${s.url}`)] : []),
  ].join("\n");
}

// ---------------------------------------------------------------------------

/** The digest for one company's week, or null when there are no cards (no email is sent then). */
export function buildDigest({ companyName, weekOf, cards, siteUrl, now = new Date(), locale = DEFAULT_LOCALE }: DigestInput): DigestEmail | null {
  if (!cards.length) return null;
  const t = createTranslator(locale, "digest");
  const ordered = [...cards].sort((a, b) => a.position - b.position);
  const company = oneLine(companyName);
  const week = weekLabel(weekOf, locale);
  const counts = countsText(ordered, locale);
  const weekUrl = weekPageUrl(siteUrl);

  const subject = t("subject", { week, counts, company });
  const intro = t("intro", { company, counts });
  const preheader = t("preheader", { counts, company, week });

  const text = [
    t("heading", { company }),
    t("weekOf", { week }),
    "",
    intro,
    "",
    ...ordered.flatMap((card, i) => [cardText(card, i + 1, now, t), ""]),
    t("textOpenWeek", { url: weekUrl }),
    "",
    "--",
    t("notice"),
    "",
    t("labelsTitle"),
    ...digestLabels(ordered, locale).map((l) => `- ${l.label}: ${l.meaning}`),
    t("swedishTime"),
    "",
    t("sentBy"),
    "",
  ].join("\n");

  return { subject, html: html({ subject, preheader, company, week, intro, cards: ordered, weekUrl, now, t }), text };
}
