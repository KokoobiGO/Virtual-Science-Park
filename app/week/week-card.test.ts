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
  key: "opportunity:1d93e14c-54cc-4212-8636-4a199f9c7c9d",
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
    opensAt: null,
    deadline: new Date("2026-12-02T13:00:00Z"),
    eventDate: null,
    simulated: false,
    externalId: "watchdog-2026",
    sourceState: "live",
    cachedAt: null,
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
    // Read live: no data status label.
    expect(html).not.toContain("data-data-status");
    expect(html).not.toContain("Simulated");
    expect(html).not.toContain("Not open yet");
    expect(html).not.toMatch(/eligible/i);
  });

  it("keeps what is uncertain and the sources behind one closed Details toggle", () => {
    const html = render(matchCard());
    const details = html.slice(html.indexOf("<details"), html.indexOf("</details>"));
    expect(html.match(/<details/g)).toHaveLength(1);
    expect(html).not.toMatch(/<details[^>]*\sopen/);
    expect(details).toContain("<summary");
    expect(details).toContain("Details");
    expect(details).toContain("What is uncertain");
    expect(details).toContain("https://www.vinnova.se/e/watchdog/");
    // Why it fits and the next step stay in view, outside the toggle.
    expect(html.indexOf("Why it fits")).toBeLessThan(html.indexOf("<details"));
    expect(html.indexOf("Next step")).toBeLessThan(html.indexOf("<details"));
  });

  it("leaves out the Details toggle when there is nothing to put in it", () => {
    expect(render(matchCard({ uncertainties: [], sources: [] }))).not.toContain("<details");
  });

  it("says how close the deadline is in words, and that a passed one has passed", () => {
    expect(render(matchCard())).toContain("Closes in 18 days");
    const opportunity = matchCard().opportunity!;
    const passed = render(matchCard({ opportunity: { ...opportunity, deadline: new Date("2026-11-10T13:00:00Z") } }));
    expect(passed).toContain("Deadline passed");
    expect(passed).toContain('data-urgency="passed"');
  });

  it("writes the interface in Swedish and keeps the stored texts as they are", () => {
    const html = renderToStaticMarkup(createElement(WeekCard, { card: matchCard(), now, locale: "sv" }));
    for (const text of ["Möjlig matchning", "Utlysning", "Varför det passar", "Nästa steg", "Vad som är osäkert", "Sista dag", "2 dec. 2026, 14:00", "Stänger om 18 dagar"]) {
      expect(html).toContain(text);
    }
    // The judge's why and the title are data: never translated.
    expect(html).toContain("Your underwater sensors fit");
    expect(html).toContain("The Baltic Marine Watchdog Challenge");
    expect(html).not.toMatch(/berättigad|behörig/i);
  });

  it("says when a call is not open yet, and stops once it has opened", () => {
    const opportunity = matchCard().opportunity!;
    expect(render(matchCard({ opportunity: { ...opportunity, opensAt: new Date("2026-11-30T23:00:00Z") } }))).toContain("Not open yet: opens 1 Dec 2026");
    expect(render(matchCard({ opportunity: { ...opportunity, opensAt: new Date("2026-11-01T00:00:00Z") } }))).not.toContain("Not open yet");
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

  it("labels hand-entered data and leaves out the calendar without a date", () => {
    const html = render(
      matchCard({
        opportunity: { ...matchCard().opportunity!, simulated: true, externalId: "testbed-ocean-lab", sourceState: "simulated", deadline: null, kind: "testbed" },
      }),
    );
    expect(html).toContain('data-data-status="hand_entered"');
    expect(html).toContain("Hand-entered");
    expect(html).not.toContain("Simulated");
    expect(html).toContain("Testbed");
    expect(html).not.toContain("Add to calendar");
  });

  it("labels the team's sample rows as simulated, and a hand-entered source even on a row not marked", () => {
    const opportunity = matchCard().opportunity!;
    const sample = render(matchCard({ opportunity: { ...opportunity, simulated: true, externalId: "fixture-vinnova-1" } }));
    expect(sample).toContain('data-data-status="simulated"');
    expect(sample).toContain("Simulated");
    expect(render(matchCard({ opportunity: { ...opportunity, sourceState: "simulated" } }))).toContain('data-data-status="hand_entered"');
  });

  it("labels a card whose source is a cached copy, with the date of the copy", () => {
    const opportunity = matchCard().opportunity!;
    const html = render(matchCard({ opportunity: { ...opportunity, sourceState: "cached", cachedAt: new Date("2026-11-10T02:00:00Z") } }));
    expect(html).toContain('data-data-status="cached"');
    expect(html).toContain("Cached copy \u00B7 10 Nov 2026");
    expect(render(matchCard({ opportunity: { ...opportunity, sourceState: "cached" } }))).toContain("Cached copy \u00B7 date unknown");
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
