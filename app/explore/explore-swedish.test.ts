import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import sv from "@/messages/sv.json";
import { NO_FILTERS, type ExploreFilters, type ExploreItem, type MatchInfo } from "@/lib/explore/filter";
import { buildTestbedMap, SOUTHERN_SWEDEN } from "@/lib/explore/map";
import { buildTimeline } from "@/lib/explore/timeline";
import { LocaleProvider } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/config";
import { leafPaths } from "@/lib/i18n/translate";
import { ExploreList } from "./explore-list";
import { ExploreMap } from "./explore-map";
import { ExploreTimeline } from "./explore-timeline";
import { FilterForm, ViewTabs } from "./filter-form";
import { tagChip, tagName } from "./labels";

/** C19: /explore in Swedish. The data (titles, sources, the judge's why) stays as stored. */

const NOW = new Date("2026-11-14T12:00:00Z");
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

function item(id: string, overrides: Partial<ExploreItem> = {}): ExploreItem {
  return {
    id,
    kind: "funding",
    source: "Vinnova",
    externalId: id,
    title: `Title ${id}`,
    url: `https://example.org/${id}`,
    description: null,
    opensAt: null,
    deadline: days(60),
    eventDate: null,
    tags: [],
    simulated: false,
    verified: null,
    sourceState: "live",
    cachedAt: null,
    ...overrides,
  };
}

const WHY = "Your sensor work matches the call's focus on underwater monitoring.";
const live = item("live", { tags: ["marine", "ai"] });
const soon = item("soon", { deadline: days(3) });
const closed = item("closed", { deadline: days(-10) });
const later = item("later", { opensAt: days(10), deadline: days(90) });
const cached = item("cached", { source: "EU Funding & Tenders", sourceState: "cached", cachedAt: new Date("2026-11-10T02:00:00Z") });
const hand = item("hand", { kind: "event", source: "BSP events", deadline: null, eventDate: days(20), simulated: true, sourceState: "simulated" });
const series = item("series", { kind: "event", source: "BSP events", deadline: null });
const facility = item("mtc-salto-karlskrona", { kind: "testbed", source: "Curated testbed list", deadline: null, simulated: true, sourceState: "simulated", verified: true });
const nowhere = item("nowhere", { kind: "testbed", source: "Curated testbed list", deadline: null, verified: false });
const all = [live, soon, closed, later, cached, hand, series, facility, nowhere];
const matches = new Map<string, MatchInfo>([
  ["live", { position: 1, rank: 1, why: WHY }],
  ["later", { position: 2, rank: 3, why: null }],
  ["nowhere", { position: 3, rank: 4, why: WHY }],
]);

/** LocaleProvider with its children optional in the props, so createElement can take them as its third argument. */
const Provider = LocaleProvider as (props: { locale: Locale; children?: ReactNode }) => ReactNode;

/** The server render in one language, with the provider the page puts around it. */
function render(element: ReactElement, locale: Locale): string {
  return renderToString(createElement(Provider, { locale }, element)).replaceAll("<!-- -->", "");
}

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

/**
 * Pieces of English interface text, from the catalogue: every text of these
 * namespaces that Swedish says differently, cut at its placeholders. Single
 * lower-case words ("calls") are left out: they are also ids and data. None
 * of the rest may be left in a Swedish render, as a whole word.
 */
function englishPieces(...paths: string[]): RegExp[] {
  const read = (catalogue: unknown, path: string) => path.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], catalogue) as string;
  const pieces = new Set<string>();
  for (const root of paths) {
    for (const leaf of leafPaths(read(en, root))) {
      const path = `${root}.${leaf}`;
      if (read(en, path) === read(sv, path)) continue;
      for (const piece of read(en, path).split(/\{\w+\}|<\/?\w+>/)) {
        const trimmed = piece.trim().replace(/^[·:,.()]+|[·:,.()]+$/g, "").trim();
        if (trimmed.length >= 5 && (/\s/.test(trimmed) || /^\p{Lu}/u.test(trimmed))) pieces.add(trimmed);
      }
    }
  }
  return [...pieces].map((piece) => new RegExp(`(?<!\\p{L})${escape(piece).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?!\\p{L})`, "u"));
}

const ENGLISH = englishPieces("explore", "common.kinds", "dataStatus.kinds");

function expectNoEnglish(html: string) {
  const left = ENGLISH.filter((piece) => piece.test(html)).map(String);
  expect(left, "English interface text in the Swedish render").toEqual([]);
}

describe("the list in Swedish", () => {
  const filters: ExploreFilters = NO_FILTERS;
  const html = render(createElement(ExploreList, { items: all, total: all.length, matches, filters, now: NOW, locale: "sv" }), "sv");

  it("says the count, kinds, statuses, dates, labels and match notes in Swedish", () => {
    expect(html).toContain(`Alla ${all.length} möjligheter, varav 3 finns bland era rangordnade matchningar.`);
    expect(html).toContain(">Utlysning<");
    expect(html).toContain(">Evenemang<");
    expect(html).toContain(">Testbädd<");
    expect(html).toContain(">Stänger snart<");
    expect(html).toContain(">Stängd<");
    expect(html).toMatch(/Sista dag \d+ [a-zé]+\.? 2027/);
    expect(html).toContain("(om 3 dagar)");
    expect(html).toContain("Inget datum");
    expect(html).toContain("Sparad kopia · 10 nov. 2026");
    expect(html).toContain("Inlagt för hand");
    expect(html).toContain("Möjlig matchning för er, nummer 1 i er rangordning.");
    expect(html).toContain("Inte bedömd än, så det finns ingen motivering nedskriven.");
    expect(html).toContain('<span class="sr-only">Taggar:</span>');
    expect(html).toContain(">marin<");
    expect(html).toContain(">ai<");
    expect(html).toContain(" (öppnas i en ny flik)");
  });

  it("keeps the data as stored", () => {
    expect(html).toContain(escape(WHY));
    expect(html).toContain("Title live");
    expect(html).toContain("EU Funding &amp; Tenders");
    expect(html).toContain('href="https://example.org/live"');
  });

  it("leaves no English interface text", () => {
    expectNoEnglish(html);
    // The check itself finds the English words in the English render.
    const english = render(createElement(ExploreList, { items: all, total: all.length, matches, filters, now: NOW }), "en");
    expect(ENGLISH.filter((piece) => piece.test(english)).length).toBeGreaterThan(8);
  });

  it("says the empty states in Swedish", () => {
    const filtered = render(createElement(ExploreList, { items: [], total: all.length, matches: null, filters: { ...NO_FILTERS, q: "x" }, now: NOW, locale: "sv" }), "sv");
    expect(filtered).toContain(`0 av ${all.length} möjligheter.`);
    expect(filtered).toContain("Ingen möjlighet passar de här filtren.");
    expect(filtered).toMatch(/href="\/explore"[^>]*>Rensa filtren</);
    const empty = render(createElement(ExploreList, { items: [], total: 0, matches: null, filters: NO_FILTERS, now: NOW, locale: "sv" }), "sv");
    expect(empty).toContain("Inga möjligheter har samlats in än.");
    expectNoEnglish(filtered + empty);
  });
});

describe("the filters and view tabs in Swedish", () => {
  it("names the fields, options and views in Swedish and keeps the English values", () => {
    const html = render(createElement("div", null, createElement(ViewTabs, { filters: NO_FILTERS, locale: "sv" }), createElement(FilterForm, { filters: NO_FILTERS, locale: "sv" })), "sv");
    expect(html).toContain('aria-label="Vy"');
    for (const view of ["Lista", "Tidslinje för sista dagar", "Karta"]) expect(html).toContain(`>${view}</a>`);
    for (const label of ["Sök i titlarna", "Typ", "Tagg", "Sista dag"]) expect(html).toContain(`>${label}</label>`);
    expect(html).toContain('placeholder="Till exempel: havsbaserad vindkraft"');
    expect(html).toContain('<option value="funding">Utlysning</option>');
    expect(html).toContain('<option value="defence">Försvar</option>');
    expect(html).toContain('<option value="ai">AI</option>');
    expect(html).toContain('<option value="soon">Stänger inom 30 dagar</option>');
    expect(html).toContain(">Filtrera</button>");
    expect(html).toContain(">Rensa</a>");
    expectNoEnglish(html);
  });

  it("keeps every English name as it was", () => {
    const html = render(createElement(FilterForm, { filters: NO_FILTERS }), "en");
    for (const option of ["Funding call", "Test facility", "Marine", "Defence", "Sensor", "Cyber", "AI", "Energy", "Open now", "Closing within 30 days", "No date", "All kinds", "All tags", "Any date"]) {
      expect(html).toContain(`>${option}</option>`);
    }
    for (const tag of ["marine", "defence", "sensor", "cyber", "ai", "energy"]) expect(tagChip(tag, "en")).toBe(tag);
    expect(tagName("not-a-tag", "sv")).toBe("not-a-tag");
  });
});

describe("the timeline in Swedish", () => {
  const html = render(createElement(ExploreTimeline, { timeline: buildTimeline(all, NO_FILTERS, NOW), matches, filters: NO_FILTERS, now: NOW, locale: "sv" }), "sv");

  it("says the sections, months, counts and labels in Swedish", () => {
    expect(html).toContain(">Sista dagar för utlysningar</h2>");
    expect(html).toContain(">Evenemang</h2>");
    expect(html).toContain("4 utlysningar vars sista dag inte har passerat");
    expect(html).toContain("1 daterat evenemang från i dag och framåt, efter datum. 1 återkommande serie har inget sparat datum och listas efter dem.");
    expect(html).toContain('aria-label="Sista dagar per månad"');
    expect(html).toContain("Januari 2027");
    expect(html).toContain(">jan.</span>");
    expect(html).toContain("(1 utlysning)");
    expect(html).toContain("(1 evenemang)");
    expect(html).toMatch(/aria-label="November 2026: 1 sista dag"/);
    expect(html).toContain("Inte öppen än: öppnar 24 nov. 2026.");
    expect(html).toContain("Återkommande, inget datum sparat");
    expect(html).toContain(">Er möjliga matchning, nummer 1<");
    expect(html).toContain('title="Inte bedömd än."');
    expect(html).toContain(">Stänger snart<");
    expect(html).toContain("Sparad kopia · 10 nov. 2026");
  });

  it("keeps the data and leaves no English interface text", () => {
    expect(html).toContain(`title="${escape(WHY)}"`);
    expect(html).toContain("Title soon");
    expectNoEnglish(html);
  });

  it("says the empty states in Swedish", () => {
    const filters: ExploreFilters = { ...NO_FILTERS, view: "timeline", tag: "cyber" };
    const empty = render(createElement(ExploreTimeline, { timeline: buildTimeline(all, filters, NOW), matches: null, filters, now: NOW, locale: "sv" }), "sv");
    expect(empty).toContain("Ingen öppen utlysning passar de här filtren.");
    expect(empty).toContain("Inget daterat evenemang framöver passar de här filtren.");
    expect(empty).toContain('href="/explore?view=timeline"');
    expectNoEnglish(empty);
  });
});

describe("the map in Swedish", () => {
  const map = buildTestbedMap(all, NO_FILTERS, SOUTHERN_SWEDEN, "sv");
  const html = render(createElement(ExploreMap, { map, matches, filters: NO_FILTERS, locale: "sv" }), "sv");

  it("says the count, notice, legend, sections and card labels in Swedish", () => {
    expect(html).toContain("Alla 2 testbäddar: 1 på kartan, 1 listade under den.");
    expect(html).toContain("En översiktsskiss, inte en exakt karta");
    expect(html).toContain(">Testbäddar på kartan</h2>");
    expect(html).toContain('aria-label="Skisskarta över södra Sverige med 1 testbädd"');
    expect(html).toContain('aria-label="Teckenförklaring"');
    expect(html).toContain("Verifierad: en officiell sida bekräftar den");
    expect(html).toContain(">Norge</text>");
    expect(html).toContain(">Östersjön</text>");
    expect(html).toContain("Välj en nål för att se testbädden.");
    expect(html).toContain(">Plats inte sparad</h2>");
    expect(html).toContain(">Testbädd<");
    expect(html).toContain(">Inte verifierad<");
    expect(html).toContain("Inte verifierad: ingen officiell sida har hittats än");
    expect(html).toContain(">Visa den i listan</a>");
    expect(html).toContain("Möjlig matchning för er, nummer 3 i er rangordning.");
    expect(html).toContain('title="Title mtc-salto-karlskrona (Karlskrona)"');
  });

  it("puts a Swedish place line on each pin's card", () => {
    expect(map.pins[0].placeSource).toMatch(/^Från /);
  });

  it("keeps the data and leaves no English interface text", () => {
    expect(html).toContain("Title nowhere");
    expect(html).toContain(escape(WHY));
    expectNoEnglish(html);
  });

  it("says the empty state in Swedish", () => {
    const filters: ExploreFilters = { ...NO_FILTERS, view: "map", q: "moon base" };
    const empty = render(createElement(ExploreMap, { map: buildTestbedMap(all, filters, SOUTHERN_SWEDEN, "sv"), matches: null, filters, locale: "sv" }), "sv");
    expect(empty).toContain("0 av 2 testbäddar: 0 på kartan.");
    expect(empty).toContain("Ingen testbädd passar de här filtren.");
    expect(empty).toContain('href="/explore?view=map"');
    expectNoEnglish(empty);
  });
});
