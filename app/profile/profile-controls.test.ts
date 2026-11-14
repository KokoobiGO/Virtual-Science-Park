import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { EvidenceView } from "@/lib/profile-view/load";

vi.mock("./actions", () => ({ saveClaim: vi.fn(), reviewSuggestion: vi.fn(), setPriority: vi.fn() }));

const { ClaimEditor } = await import("./claim-editor");
const { EvidenceViewer } = await import("./evidence-viewer");
const { PrioritySwitches } = await import("./priority-switches");
const { SuggestionReview } = await import("./suggestion-review");

const render = renderToStaticMarkup;

describe("ClaimEditor (C20)", () => {
  const props = { field: "summary", label: "Summary", claimId: "c1", isList: false, defaultPrivate: false };

  it("names the Edit button after its field and keeps a status region in the page for 'Saved.'", () => {
    // ClaimEditor's props type requires children, so they go in the props here (tests are .ts, without JSX).
    // eslint-disable-next-line react/no-children-prop
    const out = render(createElement(ClaimEditor, { ...props, initialText: "We build sonar.", children: "We build sonar." }));
    expect(out).toContain('aria-label="Edit Summary"');
    expect(out).toContain('role="status"');
    expect(out).toContain("We build sonar.");
  });

  it("offers Add for an empty field", () => {
    // eslint-disable-next-line react/no-children-prop
    const out = render(createElement(ClaimEditor, { ...props, initialText: "", children: "Missing" }));
    expect(out).toContain('aria-label="Add Summary"');
  });
});

describe("SuggestionReview (C20)", () => {
  it("names both buttons after the field and never disables them, so focus is not lost", () => {
    const out = render(createElement(SuggestionReview, { claimId: "c1", fieldLabel: "Markets", returnFocusTo: "field-markets" }));
    expect(out).toContain('aria-label="Accept the suggested Markets"');
    expect(out).toContain('aria-label="Reject the suggested Markets"');
    expect(out).not.toMatch(/\sdisabled[=\s>]/);
    expect(out).toContain('role="status"');
  });
});

describe("PrioritySwitches (C20)", () => {
  it("writes On or Off on each switch and gives its state as aria-pressed", () => {
    const out = render(
      createElement(PrioritySwitches, {
        switches: [
          { priority: "funding", label: "Funding", on: true },
          { priority: "events", label: "Events", on: false },
        ],
      }),
    );
    expect(out).toContain('aria-label="Your priorities"');
    expect(out).toMatch(/aria-pressed="true"[^>]*>.*On: .*Funding/);
    expect(out).toMatch(/aria-pressed="false"[^>]*>.*Off: .*Events/);
  });
});

describe("EvidenceViewer (D20)", () => {
  const quote = (over: Partial<EvidenceView>): EvidenceView => ({
    id: "e1",
    quote: "Vi bygger sonar.",
    quoteLang: "sv",
    url: "https://www.example.se/om-oss/en-mycket-lang-adress-som-maste-brytas",
    retrievedAt: new Date("2026-11-10T09:00:00Z"),
    simulated: false,
    context: null,
    ...over,
  });

  it("labels a quote from page text the team wrote as simulated, without a retrieval date", () => {
    const out = render(createElement(EvidenceViewer, { quotes: [quote({ simulated: true })] }));
    expect(out).toContain('data-data-status="simulated"');
    expect(out).toContain("Page text written by the team, not read from the site");
    expect(out).not.toContain("Retrieved");
    expect(out).toContain("(simulated)");
  });

  it("gives a fetched quote its retrieval date in Swedish time and a link that wraps", () => {
    const out = render(createElement(EvidenceViewer, { quotes: [quote({})] }));
    expect(out).not.toContain("data-data-status");
    expect(out).toContain("Retrieved <time");
    expect(out).toContain("10 Nov 2026");
    expect(out).toContain("break-all");
    expect(out).toContain("(opens in a new tab)");
  });
});
