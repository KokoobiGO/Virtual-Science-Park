import { createElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import sv from "@/messages/sv.json";
import { LocaleProvider } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/config";
import { leafPaths } from "@/lib/i18n/translate";
import { prerunBriefs } from "@/lib/scout/prerun";
import { NO_WEB_NOTE, type BriefView, type ScoutOption } from "@/lib/scout/types";
import { ScoutClient } from "./scout-client";

/** C19: /scout in Swedish. Questions, briefs and the job's progress lines stay as stored. */

function render(brief: BriefView | null, locale: Locale, cachedMode = false) {
  const briefs = brief
    ? [
        {
          id: brief.id,
          question: brief.question,
          status: brief.status,
          prerun: brief.prerun,
          createdAt: brief.createdAt,
          completedAt: brief.completedAt,
          options: brief.result?.options.length ?? 0,
          recordedAt: brief.result?.createdAt ?? null,
        },
      ]
    : [];
  const client = createElement(ScoutClient, { initialBriefs: briefs, initialBrief: brief, suggestions: brief ? [brief.question] : [], cachedMode });
  return renderToString(createElement(Provider, { locale }, client)).replaceAll("<!-- -->", "");
}

/** LocaleProvider with its children optional in the props, so createElement can take them as its third argument. */
const Provider = LocaleProvider as (props: { locale: Locale; children?: ReactNode }) => ReactNode;

/** The part of the page for one option card, by its citation URL. */
function card(html: string, option: ScoutOption): string {
  const at = html.indexOf(`href="${option.citation.url.replace(/&/g, "&amp;")}"`);
  return html.slice(html.lastIndexOf('data-slot="card"', at), html.indexOf("</li>", at));
}

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

/** Pieces of the English interface texts that Swedish says differently, as whole words (see app/explore/explore-swedish.test.ts). */
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

const ENGLISH = englishPieces("scout", "common.kinds", "common.opensInNewTab", "dataStatus.kinds");

/** The stored English text on the page: the brief, its options and the job's progress lines. Taken out before looking for English interface text. */
function withoutData(html: string, brief: BriefView): string {
  const data = [
    brief.question,
    brief.result?.summary ?? "",
    ...(brief.result?.notes ?? []).filter((note) => note !== NO_WEB_NOTE),
    ...brief.progress.map((p) => p.text),
    ...(brief.result?.options ?? []).flatMap((o) => [o.title, o.whyProfile, o.whySource, o.contactRoute, ...o.requirements, ...o.openQuestions, o.citation.title, o.citation.sourceName ?? ""]),
  ].filter(Boolean);
  let rest = html;
  for (const text of data.sort((a, b) => b.length - a.length)) rest = rest.replaceAll(escape(text), "");
  return rest;
}

function expectNoEnglish(html: string) {
  const left = ENGLISH.filter((piece) => piece.test(html)).map(String);
  expect(left, "English interface text in the Swedish render").toEqual([]);
}

describe("ScoutClient in Swedish", () => {
  const file = prerunBriefs().find((f) => f.slug === "embeddedart")!;
  const done: BriefView = {
    id: "00000000-0000-4000-8000-000000000001",
    question: file.question,
    status: "done",
    progress: file.brief.progress,
    result: file.brief.result,
    error: null,
    prerun: true,
    searchCount: file.searchCount,
    createdAt: "2026-12-01T09:00:00.000Z",
    completedAt: "2026-12-01T09:00:00.000Z",
    savedOpportunityIds: [file.brief.result!.options[0].opportunityId!],
  };

  it("shows a finished brief with Swedish labels and the stored texts unchanged", () => {
    const html = render(done, "sv", true);
    const options = done.result!.options;
    expect(html.match(/>Möjlig matchning</g)).toHaveLength(options.length);
    for (const heading of ["Varför den kan passa", "Krav, som källan anger dem", "Så tar ni kontakt", "Öppna frågor"]) {
      expect(html.match(new RegExp(`>${heading}</h4>`, "g"))).toHaveLength(options.length);
    }
    expect(html).toContain("För er: </span>");
    expect(html).toContain("Källan: </span>");
    expect(html).toContain("Källa: <a");
    expect(html).toContain("Från samlingen av möjligheter");
    expect(html).toMatch(/hämtad \d+ [a-zé]+ 20\d\d/);
    expect(html).toContain(">Sparad<");
    expect(html).toContain(">Spara<");
    expect(html).toContain(">Klar<");
    expect(html).toContain("Förberedda frågor (öppnas direkt i demoläget):");
    expect(html).toContain(">Era sammanställningar</h2>");
    expect(html).toContain(`${options.length} alternativ`);
    expect(html).toMatch(/Ställd 1 dec\. 10:00/);
    expect(html).toContain(">Fråga Scout</button>");
    expect(html).toContain(">Er fråga</label>");
    expect(html).toContain("Minst 10 tecken.");
    expect(html).toContain(" (öppnas i en ny flik)");
    expect(html).toContain(">Så byggde Scout den här sammanställningen</summary>");
    // The job's fixed note is translated; the brief's own texts are not.
    expect(done.result!.notes).toContain(NO_WEB_NOTE);
    expect(html).toContain("Webbsökning var inte tillgänglig; sammanställningen bygger på sparade källor.");
    expect(html).not.toContain(NO_WEB_NOTE);
    // The stored texts as they are.
    expect(html).toContain(escape(done.question));
    expect(html).toContain(escape(done.result!.summary));
    expect(html).toContain(escape(options[0].whyProfile));
    expect(html).not.toMatch(/berättigad|behörig|eligib/i);
  });

  it("labels the stored demo brief as a cached copy in Swedish, dated by its recording", () => {
    const html = render(done, "sv", true);
    expect(html.match(/data-data-status="cached"[^>]*>(?:<svg[\s\S]*?<\/svg>)?Sparad kopia · 14 nov\. 2026/g)).toHaveLength(2);
    expect(html).toContain("En sparad kopia av en tidigare Scout-körning från 14 november 2026");
  });

  it("says the job's progress lines are in English, under the list, only in Swedish", () => {
    const html = render(done, "sv", true);
    expect(html).toContain("Stegen visas på engelska, som de sparades.");
    expect(html).toContain(escape(done.progress[0].text));
    expect(render(done, "en", true)).not.toContain("The steps are shown in English");
  });

  it("leaves no English interface text apart from the stored data", () => {
    const html = render(done, "sv", true);
    expectNoEnglish(withoutData(html, done));
    // The check itself finds the English words in the English render.
    expect(ENGLISH.filter((piece) => piece.test(withoutData(render(done, "en", true), done))).length).toBeGreaterThan(10);
  });

  it("shows a running brief, a failed one and the empty states in Swedish", () => {
    const running: BriefView = { ...done, prerun: false, status: "running", result: null, progress: done.progress.slice(0, 3) };
    const runningHtml = render(running, "sv");
    expect(runningHtml).toContain("Scout arbetar med frågan.");
    expect(runningHtml).toContain(">Pågår<");
    expect(runningHtml).toContain("Scout svarar på en fråga i taget");
    expect(runningHtml).toContain(">Scout arbetar…</button>");
    expect(runningHtml).toContain("Stegen visas på engelska, som de sparades.");
    expect(runningHtml).toContain("Ställda tidigare:");
    expectNoEnglish(withoutData(runningHtml, running));

    const failed: BriefView = { ...running, status: "failed", error: null };
    const failedHtml = render(failed, "sv");
    expect(failedHtml).toContain("Misslyckades: </span>Scout kunde inte göra klart den här sammanställningen. Fråga igen för att starta en ny sammanställning.");
    expectNoEnglish(withoutData(failedHtml, failed));

    const waiting = render({ ...running, progress: [] }, "sv");
    expect(waiting).toContain("Väntar på första steget…");

    const empty = render(null, "sv");
    expect(empty).toContain("Inga sammanställningar än. Ställ en fråga ovan.");
    expect(empty).toContain("Inga än. Varje fråga ni ställer sparas här.");
    expectNoEnglish(empty);
  });

  it("shows a funder's live result and an injection warning, in both languages (B1)", () => {
    const [first, ...rest] = done.result!.options;
    const live: BriefView = {
      ...done,
      prerun: false,
      result: {
        ...done.result!,
        options: [
          {
            ...first,
            kind: "other",
            citation: {
              ...first.citation,
              origin: "live",
              liveSource: "EU Funding & Tenders portal",
              liveRetrievedAt: "2026-11-14T19:55:00Z",
              injection: "Contains text that looks like instructions to an AI; it was treated as data.",
            },
          },
          ...rest,
        ],
      },
    };
    const option = live.result!.options[0];
    const english = card(render(live, "en"), option);
    expect(english).toContain("From a funder&#x27;s live search");
    expect(english).toContain("live result (EU Funding &amp; Tenders portal), retrieved 14 Nov, 20:55");
    expect(english).toContain("Contains text that looks like instructions to an AI; it was treated as data.");
    expect(english).toContain(">Web page<");
    const swedish = card(render(live, "sv"), option);
    expect(swedish).toContain("Från en finansiärs livesökning");
    expect(swedish).toContain("liveresultat (EU Funding &amp; Tenders portal), hämtat 14 nov. 20:55");
    expect(swedish).toContain("Innehåller text som ser ut som instruktioner till en AI; den behandlades som data.");
    expect(swedish).toContain(">Webbsida<");
    // Only the flagged card carries the warning.
    expect(card(render(live, "en"), live.result!.options[1])).not.toContain("data-injection");
  });
});
