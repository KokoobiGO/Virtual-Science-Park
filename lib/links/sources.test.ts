import { describe, expect, it } from "vitest";
import { euLookupFailed, euTopicVerdict, sourceRule } from "./sources";

const TOPIC = "https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/";

describe("sourceRule", () => {
  it("sends an EU portal topic link to the API lookup, with its identifier", () => {
    expect(sourceRule(`${TOPIC}HORIZON-CL6-2027-01-CIRCBIO-01-two-stage`)).toEqual({ kind: "eu_topic", id: "HORIZON-CL6-2027-01-CIRCBIO-01-two-stage" });
  });

  it("marks ri.se and energimyndigheten.se links as not verifiable by script, with or without www", () => {
    for (const url of ["https://www.ri.se/en/maritime/test-demo/x", "https://ri.se/sv", "https://www.energimyndigheten.se/utlysningar/x/", "https://ENERGIMYNDIGHETEN.SE/"]) {
      const rule = sourceRule(url);
      expect(rule?.kind).toBe("cannot_verify");
      expect(rule?.kind === "cannot_verify" && rule.reason).toMatch(/200/);
    }
  });

  it("leaves every other link to the plain HTTP check", () => {
    for (const url of [
      "https://astazero.ri.se/", // a subdomain that answers 404 honestly
      "https://commission.europa.eu/funding-tenders/opportunities/data/topicDetails/X.html",
      "https://eic.ec.europa.eu/eic-funding-opportunities/eic-accelerator_en",
      "https://notri.se/",
      "https://www.vinnova.se/e/x/",
      "not a url",
    ]) {
      expect(sourceRule(url)).toBeNull();
    }
  });
});

describe("EU topic verdicts", () => {
  it("is ok when the API knows the identifier, broken when it does not", () => {
    const found = new Set(["HORIZON-CL6-2027-01-CIRCBIO-01-two-stage"]);
    expect(euTopicVerdict("HORIZON-CL6-2027-01-CIRCBIO-01-two-stage", found)).toEqual({ outcome: "ok", reason: "topic found in the portal API" });
    expect(euTopicVerdict("HORIZON-CL6-2027-01-CIRCBIO-01", found).outcome).toBe("broken");
    expect(euTopicVerdict("HORIZON-CL6-2027-01-CIRCBIO-01", found).reason).toMatch(/^topic not found in the portal API/);
  });

  it("is blocked, never ok or broken, when the API could not be asked", () => {
    expect(euLookupFailed("api.tech.ec.europa.eu answered 503")).toEqual({
      outcome: "blocked",
      reason: "could not ask the portal API (api.tech.ec.europa.eu answered 503); the portal page answers 200 for any id, so check by hand",
    });
  });
});
