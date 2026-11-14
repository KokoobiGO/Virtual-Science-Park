import { describe, expect, it } from "vitest";
import type { ProfileField } from "../schemas";
import { assessProfile, FACTUAL_FIELDS, MIN_SUPPORTED_FIELDS } from "./assess";
import { missingClaim, type DraftClaim } from "./output";

const SNAPSHOT = "0b1f8f7e-1b0a-4c0e-9a59-6a0e7d2f9d11";

const stated = (field: ProfileField): DraftClaim => ({
  field,
  value: field === "summary" ? "Makes sensors." : ["Sensors"],
  status: field === "inferredInterests" ? "inferred" : "stated",
  confidence: 0.8,
  evidence: [{ snapshotId: SNAPSHOT, url: "https://example.se/", quote: "Vi gör sensorer", quoteLang: "sv" }],
});

/** A full profile where the first `n` factual fields are supported and the rest are missing. */
function profile(n: number, withInterests = false): DraftClaim[] {
  return [
    ...FACTUAL_FIELDS.map((field, i) => (i < n ? stated(field) : missingClaim(field))),
    withInterests ? stated("inferredInterests") : missingClaim("inferredInterests"),
  ];
}

const BOTH_PAGES = { fetched: [{ source: "company_site" }, { source: "bsp_member" }], failed: [] };
const BSP_ONLY = { fetched: [{ source: "bsp_member" }], failed: [] };

describe("assessProfile", () => {
  it("counts seven factual fields and needs three of them", () => {
    expect(FACTUAL_FIELDS).toHaveLength(7);
    expect(FACTUAL_FIELDS).not.toContain("inferredInterests");
    expect(MIN_SUPPORTED_FIELDS).toBe(3);
  });

  it("calls a profile with no supported field thin", () => {
    expect(assessProfile(profile(0), BOTH_PAGES)).toEqual({
      status: "thin",
      note: "Too little public info: only 0 of 7 profile fields could be supported with quotes.",
    });
  });

  it("calls a profile with two supported fields thin", () => {
    expect(assessProfile(profile(2), BOTH_PAGES)).toEqual({
      status: "thin",
      note: "Too little public info: only 2 of 7 profile fields could be supported with quotes.",
    });
  });

  it("calls a profile with three supported fields profiled, with no note", () => {
    expect(assessProfile(profile(3), BOTH_PAGES)).toEqual({ status: "profiled", note: null });
  });

  it("calls a profile with all seven fields profiled", () => {
    expect(assessProfile(profile(7, true), BOTH_PAGES)).toEqual({ status: "profiled", note: null });
  });

  it("does not count inferred interests", () => {
    expect(assessProfile(profile(2, true), BOTH_PAGES).status).toBe("thin");
    expect(assessProfile([stated("inferredInterests")], BOTH_PAGES).note).toContain("only 0 of 7");
  });

  it("says the website could not be read, with the reason from the failed page", () => {
    const pages = { fetched: [{ source: "bsp_member" }], failed: [{ url: "https://x.se", error: "https://x.se answered 403" }] };
    expect(assessProfile(profile(1), pages).note).toBe(
      "Too little public info: only 1 of 7 profile fields could be supported with quotes. " +
        "The company's own website could not be read (https://x.se answered 403), so only BSP's member page was used.",
    );
  });

  it("says the member page lists no website when there was none to try", () => {
    expect(assessProfile(profile(0), BSP_ONLY).note).toBe(
      "Too little public info: only 0 of 7 profile fields could be supported with quotes. " +
        "BSP's member page lists no website, so only that page was used.",
    );
  });

  it("keeps a profiled company profiled when its website failed, with the website sentence as the note", () => {
    const pages = {
      fetched: [{ source: "bsp_member" }],
      failed: [{ url: "https://x.se", error: "https://x.se has no readable text (12 characters). It may need JavaScript." }],
    };
    expect(assessProfile(profile(5), pages)).toEqual({
      status: "profiled",
      note: "The company's own website could not be read (https://x.se has no readable text (12 characters). It may need JavaScript), so only BSP's member page was used.",
    });
  });
});
