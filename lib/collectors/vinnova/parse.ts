/**
 * Turn Vinnova's open data into funding opportunities (A9). Pure: no network,
 * and the clock comes in as `now`.
 *
 * Vinnova's model: a call ("utlysning") is a theme that runs for years; a
 * round ("ansökningsomgång") is one opening of it, with its own dates and
 * text. One opportunity is one round, joined with its call.
 */
import { withSwedishOffset } from "../swedish-time";
import type { CollectedOpportunity } from "../types";

/** One round from data.vinnova.se/api/ansokningsomgangar. Only the fields we read. */
export type VinnovaRound = {
  Diarienummer: string;
  DiarienummerUtlysning: string | null;
  Titel: string | null;
  Beskrivning: string | null;
  /** Swedish wall-clock time without an offset, e.g. "2027-01-12T14:00:00". Null while only announced. */
  Oppningsdatum: string | null;
  Stangningsdatum: string | null;
  /** 1 when the round is open to anyone. 0 for closed, invite-only and internal rounds; vinnova.se does not list those. */
  Publik: number;
  KontaktLista?: VinnovaContact[] | null;
  /** The three texts on the round's web page: 1 what it funds, 2 who can apply, 3 how much. */
  WebTextLista?: { TextID: number; TextSv: string | null }[] | null;
};

/** One call from data.vinnova.se/api/utlysningar. Only the fields we read. */
export type VinnovaCall = {
  Diarienummer: string;
  Titel: string | null;
  /** Often just the title again. */
  Beskrivning: string | null;
  KontaktLista?: VinnovaContact[] | null;
};

export type VinnovaContact = { Namn?: string | null; Epost?: string | null; Roll?: string | null };

/** One hit from vinnova.se's "Hitta finansiering" search: the round's public page. */
export type VinnovaPage = {
  /** Site-relative, e.g. "/e/innovativa-startups/innovativa-startups-2026/". */
  Url: string;
  /** When the page was published, "YYYY-MM-DD". */
  PublishedDate?: string | null;
  UtlysningSearchFindHit?: { AoDiarienummer?: string | null } | null;
};

export type VinnovaData = {
  rounds: VinnovaRound[];
  calls: VinnovaCall[];
  /** Empty when vinnova.se's search could not be read; items then link to the find-funding page. */
  pages: VinnovaPage[];
};

const SITE = "https://www.vinnova.se";
export const FIND_FUNDING_URL = `${SITE}/sok-finansiering/hitta-finansiering/`;
const MAX_DESCRIPTION = 4000;

/** The round's Swedish closing time with its offset, or undefined when it has none. */
export const roundDeadline = (round: VinnovaRound) => swedishTime(round.Stangningsdatum);

/** Public, and closes after `now` (open now or opening later). */
export function isOpenRound(round: VinnovaRound, now: Date): boolean {
  const deadline = roundDeadline(round);
  return round.Publik === 1 && deadline !== undefined && new Date(deadline) > now;
}

export function parseVinnova(data: VinnovaData, now: Date): CollectedOpportunity[] {
  const calls = new Map(data.calls.map((call) => [call.Diarienummer, call]));
  const pages = new Map(data.pages.map((page) => [page.UtlysningSearchFindHit?.AoDiarienummer, page]));

  return data.rounds
    .filter((round) => isOpenRound(round, now))
    .map((round) => toOpportunity(round, calls.get(round.DiarienummerUtlysning ?? ""), pages.get(round.Diarienummer)))
    .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime());
}

function toOpportunity(round: VinnovaRound, call: VinnovaCall | undefined, page: VinnovaPage | undefined): CollectedOpportunity {
  const callTitle = toPlainText(call?.Titel);
  const roundText = toPlainText(round.Beskrivning);
  const callText = toPlainText(call?.Beskrivning);
  const funds = webText(round, 1);
  const amount = webText(round, 3);
  const description = [
    roundText,
    // The call text is often only its title; keep it when it says more.
    callText && callText !== callTitle && callText !== roundText ? callText : "",
    funds && `Vad kan ni söka för? ${funds}`,
    amount && `Hur mycket kan ni söka? ${amount}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    externalId: round.Diarienummer,
    kind: "funding",
    // The round title is the one vinnova.se shows; call titles are often a programme name ("Chips JU").
    title: toPlainText(round.Titel) || callTitle || round.Diarienummer,
    url: page ? new URL(page.Url, SITE).toString() : FIND_FUNDING_URL,
    description: clip(description, MAX_DESCRIPTION) || undefined,
    publishedAt: page?.PublishedDate && /^\d{4}-\d{2}-\d{2}$/.test(page.PublishedDate) ? page.PublishedDate : undefined,
    opensAt: swedishTime(round.Oppningsdatum),
    deadline: roundDeadline(round),
    eligibilityText: webText(round, 2) || undefined,
    contact: contactText(round.KontaktLista?.length ? round.KontaktLista : call?.KontaktLista) || undefined,
  };
}

const webText = (round: VinnovaRound, id: number) => toPlainText(round.WebTextLista?.find((text) => text.TextID === id)?.TextSv);

function contactText(contacts: VinnovaContact[] | null | undefined): string {
  return (contacts ?? [])
    .map((c) => {
      const name = toPlainText(c.Namn);
      const role = toPlainText(c.Roll);
      const email = (c.Epost ?? "").trim();
      return [role ? `${name} (${role})` : name, email].filter(Boolean).join(", ");
    })
    .filter(Boolean)
    .join("; ");
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "\u2013", mdash: "\u2014",
  ldquo: "\u201C", rdquo: "\u201D", lsquo: "\u2018", rsquo: "\u2019",
  aring: "å", auml: "ä", ouml: "ö", Aring: "Å", Auml: "Ä", Ouml: "Ö", eacute: "é", Eacute: "É", uuml: "ü", Uuml: "Ü",
};

/** Plain text from text that may hold HTML: tags out, entities decoded, whitespace squashed. */
export function toPlainText(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
      if (code[0] !== "#") return ENTITIES[code] ?? entity;
      const point = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity;
    })
    .replace(/\s+/g, " ")
    .trim();
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${space > max * 0.8 ? cut.slice(0, space) : cut}\u2026`;
}

/**
 * Vinnova gives Swedish wall-clock time without an offset ("2027-01-12T14:00:00").
 * Add the offset that applies on that day. Missing dates and the "1900-01-01"
 * placeholder give undefined.
 */
export function swedishTime(local: string | null | undefined): string | undefined {
  const wall = local?.slice(0, 19);
  if (!wall || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(wall) || Number(wall.slice(0, 4)) < 2000) return undefined;
  return withSwedishOffset(wall);
}
