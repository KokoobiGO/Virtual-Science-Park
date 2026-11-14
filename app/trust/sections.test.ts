import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { judgeSources, type SourceStatusRow } from "@/lib/sources/health";
import { KNOWN_LIMITS } from "@/lib/trust/report";
import { KnownLimitsSection, RedTeamSection, SourceStatusSection, Table } from "./sections";

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
});
