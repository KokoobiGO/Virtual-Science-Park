import { describe, expect, it } from "vitest";
import { draftHandoff, WEEK_CARD_CONTACT_ROUTE, type HandoffOpportunity } from "./handoff";

const opportunity: HandoffOpportunity = {
  id: "6f1c2a3e-0000-4000-8000-000000000001",
  kind: "funding",
  title: "Hållbar sjöfart, steg 2",
  url: "https://www.vinnova.se/e/hallbar-sjofart/",
  source: "Vinnova",
  deadline: new Date("2026-12-03T13:00:00Z"),
  eventDate: null,
};

describe("draftHandoff", () => {
  it("names the company, the opportunity, its date and its source", () => {
    const draft = draftHandoff(opportunity, "EmbeddedArt");
    expect(draft.topic).toBe("Your week: Hållbar sjöfart, steg 2");
    expect(draft.message).toContain("EmbeddedArt would like to talk to BSP staff");
    expect(draft.message).toContain("Funding call from Vinnova: Hållbar sjöfart, steg 2");
    expect(draft.message).toContain("Deadline: 3 Dec 2026, 14:00.");
    expect(draft.message).toContain("Source: https://www.vinnova.se/e/hallbar-sjofart/");
    expect(draft.contactRoute).toBe(WEEK_CARD_CONTACT_ROUTE);
  });

  it("stores the opportunity in the context, so the screen can tell it was asked", () => {
    expect(draftHandoff(opportunity, "EmbeddedArt").context).toEqual({
      from: "your_week",
      opportunityId: opportunity.id,
      kind: "funding",
      title: opportunity.title,
      source: "Vinnova",
      url: opportunity.url,
    });
  });

  it("never calls the company eligible", () => {
    const draft = draftHandoff(opportunity, "EmbeddedArt");
    expect(`${draft.topic} ${draft.message}`).not.toMatch(/eligib|qualif/i);
    expect(draft.message).toContain("potential match");
  });

  it("shortens a very long topic", () => {
    const draft = draftHandoff({ ...opportunity, title: "x".repeat(300) }, "EmbeddedArt");
    expect(draft.topic.length).toBeLessThanOrEqual(160);
    expect(draft.topic.endsWith("...")).toBe(true);
  });
});
