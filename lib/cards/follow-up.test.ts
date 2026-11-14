import { describe, expect, it } from "vitest";
import { followUpEvents, planFollowUp } from "./follow-up";

describe("planFollowUp", () => {
  it("sends companies with rows to judge to the judge, the rest straight to the cards", () => {
    expect(planFollowUp(["embeddedart", "malvacom", "techinova"], ["malvacom", "someone-else"])).toEqual({
      judge: ["malvacom"],
      cards: ["embeddedart", "techinova"],
    });
  });

  it("names each company once and nothing when nothing was re-ranked", () => {
    expect(planFollowUp(["embeddedart", "embeddedart"], [])).toEqual({ judge: [], cards: ["embeddedart"] });
    expect(planFollowUp([], ["embeddedart"])).toEqual({ judge: [], cards: [] });
  });
});

describe("followUpEvents", () => {
  it("asks the judge to build the cards when done, and builds the others' cards in one event", () => {
    expect(followUpEvents({ judge: ["malvacom", "techinova"], cards: ["embeddedart", "acme"] })).toEqual([
      { name: "app/company.judge.requested", data: { slug: "malvacom", cards: true } },
      { name: "app/company.judge.requested", data: { slug: "techinova", cards: true } },
      { name: "app/cards.requested", data: { slugs: ["embeddedart", "acme"] } },
    ]);
  });

  it("sends no cards event without companies for it", () => {
    expect(followUpEvents({ judge: ["malvacom"], cards: [] })).toEqual([{ name: "app/company.judge.requested", data: { slug: "malvacom", cards: true } }]);
    expect(followUpEvents({ judge: [], cards: [] })).toEqual([]);
  });
});
