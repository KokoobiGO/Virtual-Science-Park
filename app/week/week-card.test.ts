import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { WeekCardView } from "@/lib/week/load";
import { WeekCard } from "./week-card";

// The buttons call server actions; rendering never does.
vi.mock("./actions", () => ({ saveOpportunity: vi.fn(), giveFeedback: vi.fn(), askBsp: vi.fn() }));

const now = new Date("2026-11-14T10:00:00Z");

const matchCard = (over: Partial<WeekCardView> = {}): WeekCardView => ({
  id: "card-1",
  position: 1,
  kind: "match",
  title: "The Baltic Marine Watchdog Challenge",
  why: "Your underwater sensors fit the call's monitoring focus.",
  nextStep: "Read the call text and list which challenge you would answer.",
  uncertainties: ["Whether a consortium is required"],
  sources: [{ url: "https://www.vinnova.se/e/watchdog/", title: "The Baltic Marine Watchdog Challenge" }],
  opportunity: {
    id: "1d93e14c-54cc-4212-8636-4a199f9c7c9d",
    kind: "funding",
    source: "Vinnova",
    url: "https://www.vinnova.se/e/watchdog/",
    deadline: new Date("2026-12-02T13:00:00Z"),
    eventDate: null,
    simulated: false,
  },
  trendArea: null,
  saved: false,
  feedback: null,
  askedBsp: false,
  ...over,
});

const render = (card: WeekCardView) => renderToStaticMarkup(createElement(WeekCard, { card, now }));

describe("WeekCard", () => {
  it("shows a match with its label, kind, why, next step, open points, date and source", () => {
    const html = render(matchCard());
    for (const text of [
      "Potential match",
      "Funding call",
      "Vinnova",
      "Why it fits",
      "Your underwater sensors fit",
      "Next step",
      "Read the call text",
      "What is uncertain",
      "Whether a consortium is required",
      "Deadline",
      "2 Dec 2026, 14:00",
    ]) {
      expect(html).toContain(text);
    }
    expect(html).not.toContain("Simulated");
    expect(html).not.toMatch(/eligible/i);
  });

  it("has every button, a calendar download and a source link that opens in a new tab", () => {
    const html = render(matchCard());
    for (const label of ["Save", "Useful", "Not relevant", "Add to calendar", "Ask BSP", "Open source"]) expect(html).toContain(label);
    expect(html).toContain('href="/api/calendar/1d93e14c-54cc-4212-8636-4a199f9c7c9d"');
    expect(html).toMatch(/href="https:\/\/www\.vinnova\.se\/e\/watchdog\/" target="_blank" rel="noopener noreferrer"/);
  });

  it("shows the stored state of the buttons", () => {
    const html = render(matchCard({ saved: true, feedback: "useful", askedBsp: true }));
    expect(html).toContain("Saved");
    expect(html).toContain("Sent to BSP staff");
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(2); // saved and useful
  });

  it("labels simulated data and leaves out the calendar without a date", () => {
    const html = render(matchCard({ opportunity: { ...matchCard().opportunity!, simulated: true, deadline: null, kind: "testbed" } }));
    expect(html).toContain("Simulated data");
    expect(html).toContain("Testbed");
    expect(html).not.toContain("Add to calendar");
  });

  it("shows a trend card's note and sources, without match label or buttons", () => {
    const html = render(
      matchCard({
        kind: "trend",
        title: "Marine: three calls close in December",
        why: "Two Vinnova calls and one EU call on ocean monitoring close in December.",
        nextStep: "Read the sources and see whether it changes your plans.",
        uncertainties: [],
        sources: [{ url: "https://www.vinnova.se/a" }, { url: "https://ec.europa.eu/b", title: "EU call" }],
        opportunity: null,
        trendArea: "marine",
      }),
    );
    expect(html).toContain("Trend note");
    expect(html).toContain("Marine");
    expect(html).toContain("What changed this week");
    expect(html).toContain("Sources");
    expect(html).toContain("vinnova.se");
    expect(html).toContain("EU call");
    expect(html).not.toContain("Potential match");
    expect(html).not.toContain("Ask BSP");
  });
});
