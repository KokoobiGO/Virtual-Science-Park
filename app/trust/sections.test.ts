import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { judgeSources, type SourceStatusRow } from "@/lib/sources/health";
import { MESSAGES } from "@/lib/i18n/translate";
import { KNOWN_LIMITS, knownLimits } from "@/lib/trust/report";
import { KnownLimitsSection, LinkHealthSection, MatchingSection, RedTeamSection, SourceStatusSection, summaryTiles, Table, TrustSummary } from "./sections";

const render = renderToStaticMarkup;
const NOW = new Date("2026-11-14T20:00:00Z");

const row = (over: Partial<SourceStatusRow>): SourceStatusRow => ({
  source: "vinnova",
  label: "Vinnova",
  state: "live",
  lastSuccessAt: new Date("2026-11-14T16:49:00Z"),
  cachedAt: null,
  itemCount: 15,
  message: null,
  ...over,
});

describe("Trust report sections (C20, D20)", () => {
  it("titles each section with an h2", () => {
    const out = render(createElement(RedTeamSection, { run: { status: "not_measured" } }));
    expect(out).toMatch(/<h2>Red-team tests<\/h2>/);
  });

  it("gives a table a caption, column headers and row headers, in a box that scrolls on its own", () => {
    const out = render(createElement(Table, { caption: "Red-team tests per group", head: ["Group", "Passed"], rows: [["Relevant questions", "8 of 8"]] }));
    expect(out).toMatch(/<div role="region" aria-labelledby="([^"]+)" tabindex="0" class="[^"]*overflow-x-auto[^"]*"><table[^>]*><caption id="\1"[^>]*>Red-team tests per group<\/caption>/);
    expect(out).toContain('<th scope="col"');
    expect(out).toMatch(/<th scope="row"[^>]*>Relevant questions<\/th>/);
  });

  it("labels each source with the shared data label, not its own words", () => {
    const sources = judgeSources(
      [
        row({}),
        row({ source: "eu_funding", label: "EU Funding & Tenders", state: "cached", cachedAt: new Date("2026-11-10T09:00:00Z") }),
        row({ source: "testbeds", label: "Curated testbed list", state: "simulated" }),
        row({ source: "tcl_events", label: "Tech Concept Lab", lastSuccessAt: new Date("2026-11-01T09:00:00Z") }),
      ],
      NOW,
    );
    const out = render(createElement(SourceStatusSection, { sources }));
    expect(out).toContain("Live · read 14 Nov 2026");
    expect(out).toContain("Cached copy · 10 Nov 2026");
    expect(out).toContain("Hand-entered");
    expect(out).toContain("Stale · last read 1 Nov 2026");
    expect(out).not.toContain("Live, stale");
    expect(out.match(/data-data-status=/g)).toHaveLength(4);
  });

  it("states the model the app runs on now, and no longer the old one alone", () => {
    const out = render(createElement(KnownLimitsSection));
    expect(KNOWN_LIMITS.join(" ")).toContain("nvidia/nemotron-3.5-super-vl-120b-a12b");
    expect(KNOWN_LIMITS.join(" ")).not.toContain("NVIDIA Nemotron 3.5 Lightning");
    expect(KNOWN_LIMITS.join(" ")).not.toMatch(/marked simulated/);
    expect(out).toMatch(/<h2>Known limits<\/h2>/);
  });

  it("counts the links a script cannot verify in their own column, and says which sites they are", () => {
    const run = { status: "measured" as const, ranAt: NOW, summary: { checked: 20, ok: 15, broken: 1, blocked: 2, unverifiable: 2 } };
    const out = render(createElement(LinkHealthSection, { run }));
    expect(out).toContain('<th scope="col" class="px-2 py-1.5 align-top first:pl-0 last:pr-0 font-medium">Cannot verify by script</th>');
    expect(out).toContain("Link health: source links checked, working, broken, unclear and cannot verify by script");
    expect(out).toContain("(Energimyndigheten, ri.se)");
    expect(out).toMatch(/<th scope="row"[^>]*>20<\/th><td[^>]*>15 \(75%\)<\/td><td[^>]*>1<\/td><td[^>]*>2<\/td><td[^>]*>2<\/td>/);
  });
});

describe("Trust report in Swedish (C19)", () => {
  it("writes headings, table heads and cells in Swedish, and the numbers and dates the Swedish way", () => {
    const run = { status: "measured" as const, ranAt: NOW, summary: { checked: 20, ok: 15, broken: 1, blocked: 2, unverifiable: 2 } };
    const out = render(createElement(LinkHealthSection, { run, locale: "sv" }));
    expect(out).toMatch(/<h2>Länkhälsa<\/h2>/);
    expect(out).toContain("Körd 14 nov. 2026 21:00 CET");
    expect(out).toContain("Kan inte kontrolleras av ett skript");
    expect(out).toContain("15 (75\u00A0%)");
  });

  it("names the red-team groups in Swedish and keeps an unknown group id readable", () => {
    const run = {
      status: "measured" as const,
      ranAt: NOW,
      summary: { groups: [{ group: "eligibility", passed: 3, total: 4 }, { group: "new_group", passed: 1, total: 1 }] },
    };
    const sv = render(createElement(RedTeamSection, { run, locale: "sv" }));
    expect(sv).toContain("Frågor av typen \u201dKan vi söka?\u201d");
    expect(sv).toContain("3 av 4");
    expect(sv).toContain("new group");
    const en = render(createElement(RedTeamSection, { run }));
    expect(en).toContain("&quot;Can we apply?&quot; questions");
  });

  it("labels the sources with the shared Swedish data labels", () => {
    const sources = judgeSources([row({ source: "testbeds", label: "Curated testbed list", state: "simulated" })], NOW);
    const out = render(createElement(SourceStatusSection, { sources, locale: "sv" }));
    expect(out).toContain("Inlagt för hand");
    expect(out).toContain("Källornas status");
    // The source's own name stays as stored.
    expect(out).toContain("Curated testbed list");
  });

  it("says a section is not measured yet, and the decision sentence, in Swedish, without the words the product rule bans", () => {
    const out = render(createElement(MatchingSection, { matching: { status: "not_measured" }, locale: "sv" }));
    expect(out).toContain("inte mätt än");
    expect(out).toContain("möjlig matchning");
    expect(out).not.toMatch(/berättigad|behörig|eligib/i);
  });

  it("keeps the known limits' model ids in Swedish too", () => {
    const out = render(createElement(KnownLimitsSection, { locale: "sv" }));
    expect(out).toMatch(/<h2>Kända begränsningar<\/h2>/);
    expect(out).toContain("nvidia/nemotron-3.5-super-vl-120b-a12b");
    expect(knownLimits("sv")).toHaveLength(KNOWN_LIMITS.length);
  });
});

describe("the report's summary and fixed wording (polish pass)", () => {
  const measured = <T,>(summary: T) => ({ status: "measured" as const, ranAt: NOW, summary });
  const empty = { status: "not_measured" as const };

  it("gives one headline number per check, and says plainly which are not measured yet", () => {
    const tiles = summaryTiles({
      profileAccuracy: empty,
      quoteCheck: empty,
      linkCheck: measured({ checked: 200, ok: 190, broken: 4, blocked: 3, unverifiable: 3 }),
      redTeam: measured({ groups: [{ group: "relevant", passed: 8, total: 8 }, { group: "override", passed: 7, total: 8 }] }),
      privacy: measured({ passed: 17, total: 17 }),
    });
    expect(tiles.map((t) => [t.key, t.value, t.detail])).toEqual([
      ["accuracy", "-", "not measured yet"],
      ["quotes", "-", "not measured yet"],
      ["links", "95%", "190 of 200 links; 4 broken"],
      ["redTeam", "94%", "15 of 16 prompts"],
      ["privacy", "100%", "17 of 17 tests"],
    ]);
    const out = render(createElement(TrustSummary, { report: { profileAccuracy: empty, quoteCheck: empty, linkCheck: empty, redTeam: empty, privacy: empty }, locale: "sv" }));
    expect(out).toMatch(/<h2 id="trust-summary"[^>]*>I korthet<\/h2>/);
    expect(out).toContain("inte mätt än");
  });

  it("puts each section behind a closed summary that shows its title, headline number and date", () => {
    const out = render(createElement(LinkHealthSection, { run: measured({ checked: 20, ok: 15, broken: 1, blocked: 2, unverifiable: 2 }) }));
    expect(out).toMatch(/^<details data-slot="card"/);
    expect(out).not.toMatch(/<details[^>]* open/);
    const summary = out.split("</summary>")[0];
    expect(summary).toContain("<h2>Link health</h2>");
    expect(summary).toContain(">75%<");
    expect(summary).toContain("Run 14 Nov 2026");
    const sources = render(createElement(SourceStatusSection, { sources: judgeSources([row({})], NOW) })).split("</summary>")[0];
    expect(sources).toContain(">1 source<");
    expect(sources).toContain("Last read 14 Nov 2026");
    const notYet = render(createElement(RedTeamSection, { run: empty })).split("</summary>")[0];
    expect(notYet).toContain(">not measured yet<");
  });

  it("says the gold claims were checked by an automated reviewer, not by the team, and that EU links go through the portal's API", () => {
    for (const locale of ["en", "sv"] as const) {
      const limits = knownLimits(locale).join(" ");
      expect(limits).toMatch(locale === "en" ? /portal's API/ : /portalens API/);
      expect(limits).not.toMatch(/only means the portal is up|betyder bara att portalen är uppe/);
    }
    const en = render(createElement(KnownLimitsSection));
    expect(en).not.toContain("team&#x27;s hand-check");
    // Who gave the verdicts is said by the note next to the numbers (profile-accuracy-section.test.ts); the description no longer claims it was the team.
    expect(MESSAGES.en.trust.profileAccuracy.description).not.toMatch(/The team checks/);
    expect(MESSAGES.sv.trust.profileAccuracy.description).not.toMatch(/Teamet kontrollerar/);
  });
});
