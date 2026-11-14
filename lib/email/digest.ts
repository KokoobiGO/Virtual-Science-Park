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
 */
import type { OpportunityKind } from "../schemas";
import { cardDates, isWebLink, kindLabel, sourceLabel, weekLabel } from "../week/format";

export type DigestOpportunity = {
  kind: OpportunityKind;
  /** Display name of the source, e.g. "Vinnova". */
  source: string;
  url: string;
  deadline: Date | null;
  eventDate: Date | null;
  /** Entered by hand by the team, not read from a live source. */
  simulated: boolean;
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
};

export type DigestEmail = { subject: string; html: string; text: string };

/** Information-only notice, shared by the HTML and the text version. */
export const DIGEST_NOTICE =
  "Information only. These cards are picked by software from public sources and your company's profile on Virtual Science Park. " +
  "A potential match is not a decision about eligibility: check the source before you act, or ask BSP staff.";

/** How the data is labelled, shared by the HTML and the text version. */
export const DIGEST_LABELS: readonly { label: string; meaning: string }[] = [
  { label: "Potential match", meaning: "an opportunity ranked for your company, with why it may fit and a next step." },
  { label: "Trend note", meaning: "a short note on this week's news and new calls in one technology area, written by software from the sources it lists." },
  { label: "Simulated data", meaning: "entered by hand by the team, not read from a live source." },
];

const AREA_LABELS: Record<string, string> = {
  marine: "Marine",
  defence: "Defence",
  sensor: "Sensors",
  cyber: "Cyber security",
  ai: "AI",
  energy: "Energy",
};

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

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "6 potential matches and a trend note", "a trend note", "1 potential match". */
export function countsText(cards: readonly DigestCard[]): string {
  const matches = cards.filter((c) => c.kind === "match").length;
  const trends = cards.length - matches;
  const parts = [
    ...(matches ? [plural(matches, "potential match", "potential matches")] : []),
    ...(trends ? [trends === 1 ? "a trend note" : `${trends} trend notes`] : []),
  ];
  return parts.join(" and ");
}

function areaLabel(area: string | null): string | null {
  return area ? (AREA_LABELS[area] ?? area) : null;
}

/** The labels on a card, in order, e.g. ["Potential match", "Funding call", "Vinnova", "Simulated data"]. */
function cardLabels(card: DigestCard): { text: string; style: "main" | "plain" | "simulated" }[] {
  if (card.kind === "trend") {
    const area = areaLabel(card.trendArea);
    return [{ text: "Trend note", style: "main" }, ...(area ? [{ text: area, style: "plain" as const }] : [])];
  }
  const o = card.opportunity;
  return [
    { text: "Potential match", style: "main" },
    ...(o ? [{ text: kindLabel(o.kind), style: "plain" as const }, { text: oneLine(o.source), style: "plain" as const }] : []),
    ...(o?.simulated ? [{ text: "Simulated data", style: "simulated" as const }] : []),
  ];
}

const whyHeading = (card: DigestCard) => (card.kind === "trend" ? "What changed this week" : "Why it fits");

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

function badge({ text, style }: { text: string; style: "main" | "plain" | "simulated" }): string {
  const base = `display:inline-block;margin:0 6px 6px 0;padding:2px 8px;border-radius:10px;font-family:${FONT};font-size:12px;line-height:18px;font-weight:600;`;
  const look =
    style === "main"
      ? { cls: "vsp-main", css: `background-color:${COLOR.mainBg};color:${COLOR.mainText};border:1px solid ${COLOR.mainBorder};` }
      : style === "simulated"
        ? { cls: "vsp-sim", css: `background-color:${COLOR.simBg};color:${COLOR.simText};border:1px dashed ${COLOR.simBorder};` }
        : { cls: "vsp-plain", css: `color:${COLOR.muted};border:1px solid ${COLOR.border};` };
  return `<span class="${look.cls}" style="${base}${look.css}">${escapeHtml(text)}</span>`;
}

function section(heading: string, body: string): string {
  return (
    `<p class="vsp-muted" style="margin:16px 0 4px;font-family:${FONT};font-size:12px;line-height:1.4;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:${COLOR.muted};">${escapeHtml(heading)}</p>` +
    body
  );
}

function cardHtml(card: DigestCard, now: Date): string {
  const dates = card.kind === "match" && card.opportunity ? cardDates(card.opportunity, now) : [];
  const sources = webSources(card);
  const parts = [
    `<p style="margin:0 0 4px;">${cardLabels(card).map(badge).join("")}</p>`,
    `<h2 class="vsp-text" style="margin:0;font-family:${FONT};font-size:18px;line-height:1.35;font-weight:600;color:${COLOR.text};">${escapeHtml(oneLine(card.title))}</h2>`,
    dates.length
      ? `<p class="vsp-muted" style="${mutedStyle}margin-top:6px;">${dates
          .map((d) => `${escapeHtml(d.label)}: <strong>${escapeHtml(d.text)}</strong>${d.passed ? " (passed)" : ""}`)
          .join("<br>")}</p>`
      : "",
    section(whyHeading(card), `<p class="vsp-text" style="${textStyle}">${escapeLines(card.why)}</p>`),
    section("Next step", `<p class="vsp-text" style="${textStyle}">${escapeLines(card.nextStep)}</p>`),
    card.uncertainties.length
      ? section(
          "What is uncertain",
          `<ul style="margin:0;padding:0 0 0 20px;">${card.uncertainties
            .map((u) => `<li class="vsp-text" style="${textStyle}margin-bottom:4px;">${escapeHtml(oneLine(u))}</li>`)
            .join("")}</ul>`,
        )
      : "",
    sources.length
      ? section(
          sources.length === 1 ? "Source" : "Sources",
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

function html({ subject, preheader, company, week, intro, cards, weekUrl, now }: {
  subject: string;
  preheader: string;
  company: string;
  week: string;
  intro: string;
  cards: readonly DigestCard[];
  weekUrl: string;
  now: Date;
}): string {
  const labels = DIGEST_LABELS.map((l) => `<strong>${escapeHtml(l.label)}</strong>: ${escapeHtml(l.meaning)}`).join("<br>");
  return [
    "<!doctype html>",
    '<html lang="en">',
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
    `<h1 class="vsp-text" style="margin:4px 0 0 0;font-family:${FONT};font-size:24px;line-height:1.3;font-weight:700;color:${COLOR.text};">Your week: ${escapeHtml(company)}</h1>`,
    `<p class="vsp-muted" style="${mutedStyle}margin-top:4px;">Week of ${escapeHtml(week)}</p>`,
    `<p class="vsp-text" style="${textStyle}margin-top:16px;">${escapeHtml(intro)}</p>`,
    `</td></tr>`,
    ...cards.map((card) => cardHtml(card, now)),
    `<tr><td align="center" style="padding:8px 0 24px 0;">`,
    `<a href="${escapeHtml(weekUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 22px;border-radius:6px;background-color:${COLOR.button};color:${COLOR.buttonText};font-family:${FONT};font-size:16px;font-weight:600;line-height:1.2;text-decoration:none;">Open Your week</a>`,
    `<p class="vsp-muted" style="${mutedStyle}margin-top:10px;">Save a card, say what is useful or add a date to your calendar on the site:<br>${link(weekUrl, weekUrl)}</p>`,
    `</td></tr>`,
    `<tr><td class="vsp-rule" style="padding:16px 4px 0 4px;border-top:1px solid ${COLOR.border};">`,
    `<p class="vsp-muted" style="${smallStyle}">${escapeHtml(DIGEST_NOTICE)}</p>`,
    `<p class="vsp-muted" style="${smallStyle}margin-top:10px;">How the data is labelled:<br>${labels}<br>Dates are in Swedish time.</p>`,
    `<p class="vsp-muted" style="${smallStyle}margin-top:10px;">Sent by Virtual Science Park for members of Blue Science Park.</p>`,
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

function cardText(card: DigestCard, number: number, now: Date): string {
  const dates = card.kind === "match" && card.opportunity ? cardDates(card.opportunity, now) : [];
  const sources = webSources(card);
  const indent = (value: string) =>
    value
      .trim()
      .split(/\r?\n/)
      .map((line) => `   ${line.trim()}`)
      .join("\n");
  return [
    `${number}. ${oneLine(card.title)}`,
    `   ${cardLabels(card)
      .map((l) => l.text)
      .join(" | ")}`,
    ...dates.map((d) => `   ${d.label}: ${d.text}${d.passed ? " (passed)" : ""}`),
    `   ${whyHeading(card)}:`,
    indent(card.why),
    "   Next step:",
    indent(card.nextStep),
    ...(card.uncertainties.length ? ["   What is uncertain:", ...card.uncertainties.map((u) => `   - ${oneLine(u)}`)] : []),
    ...(sources.length ? [`   ${sources.length === 1 ? "Source" : "Sources"}:`, ...sources.map((s) => `   ${s.label}: ${s.url}`)] : []),
  ].join("\n");
}

// ---------------------------------------------------------------------------

/** The digest for one company's week, or null when there are no cards (no email is sent then). */
export function buildDigest({ companyName, weekOf, cards, siteUrl, now = new Date() }: DigestInput): DigestEmail | null {
  if (!cards.length) return null;
  const ordered = [...cards].sort((a, b) => a.position - b.position);
  const company = oneLine(companyName);
  const week = weekLabel(weekOf);
  const counts = countsText(ordered);
  const weekUrl = weekPageUrl(siteUrl);

  const subject = `Your week, ${week}: ${counts} for ${company}`;
  const intro =
    `This week's picks for ${company}: ${counts}. Each card says why it may fit, a next step and where it comes from. ` +
    "A card is a potential match, not a decision: check the source or ask BSP staff.";
  const preheader = `${counts} for ${company}, week of ${week}.`;

  const text = [
    `Your week: ${company}`,
    `Week of ${week}`,
    "",
    intro,
    "",
    ...ordered.flatMap((card, i) => [cardText(card, i + 1, now), ""]),
    `Open Your week to save a card, say what is useful or add a date to your calendar: ${weekUrl}`,
    "",
    "--",
    DIGEST_NOTICE,
    "",
    "How the data is labelled:",
    ...DIGEST_LABELS.map((l) => `- ${l.label}: ${l.meaning}`),
    "Dates are in Swedish time.",
    "",
    "Sent by Virtual Science Park for members of Blue Science Park.",
    "",
  ].join("\n");

  return { subject, html: html({ subject, preheader, company, week, intro, cards: ordered, weekUrl, now }), text };
}
