import { describe, expect, it } from "vitest";
import { euTopicIdFromUrl, euTopicUrl } from "./topic-url";

const PAGE = "https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/";

describe("euTopicUrl", () => {
  it("puts the identifier on the portal's topic page as it is, suffix and case included", () => {
    expect(euTopicUrl("HORIZON-CL5-2027-07-D3-26")).toBe(`${PAGE}HORIZON-CL5-2027-07-D3-26`);
    expect(euTopicUrl("HORIZON-CL6-2027-01-CIRCBIO-01-two-stage")).toBe(`${PAGE}HORIZON-CL6-2027-01-CIRCBIO-01-two-stage`);
    expect(euTopicUrl("HORIZON-CL5-2027-04-Two-Stage-D2-07")).toBe(`${PAGE}HORIZON-CL5-2027-04-Two-Stage-D2-07`);
  });
});

describe("euTopicIdFromUrl", () => {
  it("reads the identifier back from a topic link", () => {
    for (const id of ["HORIZON-CL6-2027-01-CIRCBIO-01-two-stage", "HORIZON-CL5-2027-04-Two-Stage-D2-07", "EDF-2027-LS-RA-CHALLENGE-DIGIT-HAIDP"]) {
      expect(euTopicIdFromUrl(euTopicUrl(id))).toBe(id);
    }
  });

  it("ignores a trailing slash, a query and the app's ;callCode= part", () => {
    expect(euTopicIdFromUrl(`${PAGE}HORIZON-CL5-2027-07-D3-26/`)).toBe("HORIZON-CL5-2027-07-D3-26");
    expect(euTopicIdFromUrl(`${PAGE}HORIZON-CL5-2027-07-D3-26?order=DESC`)).toBe("HORIZON-CL5-2027-07-D3-26");
    expect(euTopicIdFromUrl(`${PAGE}HORIZON-CL5-2027-07-D3-26;callCode=null`)).toBe("HORIZON-CL5-2027-07-D3-26");
  });

  it("is null for anything that is not a portal topic link", () => {
    expect(euTopicIdFromUrl("https://commission.europa.eu/funding-tenders/opportunities/data/topicDetails/HORIZON-CL6-2027-01-CIRCBIO-01-two-stage.html")).toBeNull();
    expect(euTopicIdFromUrl("https://eic.ec.europa.eu/eic-funding-opportunities/eic-accelerator_en")).toBeNull();
    expect(euTopicIdFromUrl(PAGE)).toBeNull();
    expect(euTopicIdFromUrl(`${PAGE}A/B`)).toBeNull();
    expect(euTopicIdFromUrl(`https://ec.europa.eu.example.com/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/X`)).toBeNull();
    expect(euTopicIdFromUrl("not a url")).toBeNull();
  });
});
