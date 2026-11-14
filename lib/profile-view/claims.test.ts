import { describe, expect, it } from "vitest";
import { ProfileField } from "../schemas";
import { claimsInCharge, confidenceLevel, formatDate, profileView, STATUS_BADGE, valueItems, type ClaimRow } from "./claims";

const NOW = new Date("2026-11-14T12:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY_MS);

let next = 0;
const row = (overrides: Partial<ClaimRow>): ClaimRow => ({
  id: `claim-${++next}`,
  field: "summary",
  value: "Builds sensors for maritime surveillance.",
  status: "stated",
  confidence: 0.9,
  visibility: "public",
  reviewState: "active",
  updatedBy: "profiler",
  supersedesId: null,
  updatedAt: daysAgo(1),
  ...overrides,
});

describe("profileView", () => {
  it("has all eight fields in profile order, and shows a field without a claim as missing", () => {
    const view = profileView([row({ field: "technologies", value: ["Hydroacoustics"] })], { now: NOW });
    expect(view.map((f) => f.field)).toEqual(ProfileField.options);
    const summary = view.find((f) => f.field === "summary")!;
    expect(summary.claim).toBeNull();
    expect(summary.status).toBe("missing");
    expect(summary.confidence).toBeNull();
    expect(summary.stale).toBe(false);
    expect(view.find((f) => f.field === "technologies")!.status).toBe("stated");
  });

  it("gives stated, inferred and missing claims their own status", () => {
    const view = profileView(
      [
        row({ field: "summary" }),
        row({ field: "inferredInterests", status: "inferred", value: ["Defence funding"], confidence: 0.6 }),
        row({ field: "statedPriorities", status: "missing", value: null, confidence: 0 }),
      ],
      { now: NOW },
    );
    const by = (f: string) => view.find((v) => v.field === f)!;
    expect(by("summary")).toMatchObject({ status: "stated", confidence: "high" });
    expect(by("inferredInterests")).toMatchObject({ status: "inferred", confidence: "med" });
    // A missing claim is shown as missing, with the claim kept (for its date), and no confidence.
    expect(by("statedPriorities").claim).not.toBeNull();
    expect(by("statedPriorities")).toMatchObject({ status: "missing", confidence: null });
    expect(STATUS_BADGE.stated.label).toBe("Stated");
    expect(STATUS_BADGE.inferred.label).toBe("Inferred");
    expect(STATUS_BADGE.missing.label).toBe("Missing");
  });

  it("shows no confidence for the member's own values", () => {
    const view = profileView([row({ status: "user_corrected", updatedBy: "user", confidence: 1, value: "Our words." })], { now: NOW });
    expect(view[0]).toMatchObject({ status: "user_corrected", confidence: null });
  });

  it("flags a claim older than 90 days as stale", () => {
    const view = profileView([row({ field: "summary", updatedAt: daysAgo(91) }), row({ field: "offerings", value: ["Sonar"], updatedAt: daysAgo(90) })], { now: NOW });
    expect(view.find((v) => v.field === "summary")!.stale).toBe(true);
    expect(view.find((v) => v.field === "offerings")!.stale).toBe(false);
  });

  it("never shows superseded, rejected or suggested claims as the value", () => {
    const view = profileView(
      [
        row({ value: "Old", reviewState: "superseded" }),
        row({ value: "Said no", reviewState: "rejected" }),
        row({ value: "Proposed", reviewState: "suggested" }),
      ],
      { now: NOW },
    );
    expect(view[0].claim).toBeNull();
    expect(view[0].status).toBe("missing");
    expect(view[0].suggestion?.value).toBe("Proposed");
  });

  it("offers the newest open suggestion next to the active claim", () => {
    const active = row({ value: "Current" });
    const older = row({ value: "First idea", reviewState: "suggested", updatedAt: daysAgo(3), supersedesId: active.id });
    const newest = row({ value: "Second idea", reviewState: "suggested", updatedAt: daysAgo(1), supersedesId: active.id });
    const view = profileView([active, older, newest], { now: NOW });
    expect(view[0].claim?.id).toBe(active.id);
    expect(view[0].suggestion?.id).toBe(newest.id);
  });

  it("the public view never shows a private claim, and offers no suggestions", () => {
    const view = profileView(
      [
        row({ field: "markets", value: ["Navy test ranges"], status: "user_corrected", updatedBy: "user", visibility: "private" }),
        row({ field: "summary", reviewState: "suggested", value: "Proposed" }),
      ],
      { now: NOW, publicOnly: true },
    );
    expect(JSON.stringify(view)).not.toMatch(/Navy test ranges|Proposed/);
    expect(view.find((v) => v.field === "markets")!.status).toBe("missing");
    expect(view.every((v) => v.suggestion === null)).toBe(true);
  });
});

describe("claimsInCharge", () => {
  it("puts the member's own active claim over the profiler's, and the newest among equals", () => {
    const profiler = row({ updatedAt: daysAgo(0) });
    const own = row({ value: "Ours", status: "user_confirmed", updatedBy: "user", updatedAt: daysAgo(5) });
    expect(claimsInCharge([profiler, own]).get("summary")?.id).toBe(own.id);

    const first = row({ field: "offerings", value: ["Old"], updatedAt: daysAgo(5) });
    const second = row({ field: "offerings", value: ["New"], updatedAt: daysAgo(1) });
    expect(claimsInCharge([second, first]).get("offerings")?.id).toBe(second.id);
  });
});

describe("confidenceLevel", () => {
  it("reads 0 to 1 as low, med and high", () => {
    expect(confidenceLevel(0)).toBe("low");
    expect(confidenceLevel(0.49)).toBe("low");
    expect(confidenceLevel(0.5)).toBe("med");
    expect(confidenceLevel(0.79)).toBe("med");
    expect(confidenceLevel(0.8)).toBe("high");
    expect(confidenceLevel(1)).toBe("high");
  });
});

describe("formatDate", () => {
  it("writes the day in Swedish time", () => {
    expect(formatDate(new Date("2026-11-14T12:00:00Z"))).toBe("14 Nov 2026");
    // 23:30 UTC on 31 Dec is already New Year in Sweden.
    expect(formatDate(new Date("2026-12-31T23:30:00Z"))).toBe("1 Jan 2027");
  });
});

describe("valueItems", () => {
  it("turns a value into display items", () => {
    expect(valueItems(null)).toEqual([]);
    expect(valueItems("  One   sentence. ")).toEqual(["One sentence."]);
    expect(valueItems(["Sonar", "  ", " Hydro\nacoustics "])).toEqual(["Sonar", "Hydro acoustics"]);
  });
});
