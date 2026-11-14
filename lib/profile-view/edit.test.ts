import { describe, expect, it } from "vitest";
import {
  defaultVisibility,
  MAX_ITEMS,
  MAX_SUMMARY_CHARS,
  parseValueInput,
  planEdit,
  planReview,
  sameValue,
  valueToInput,
  withPriority,
} from "./edit";

describe("parseValueInput", () => {
  it("reads the summary as one sentence with tidy spacing", () => {
    expect(parseValueInput("summary", "  We build\n UV sensors.  ")).toEqual({ ok: true, value: "We build UV sensors." });
  });

  it("reads other fields as one item per line, without blanks or repeats", () => {
    expect(parseValueInput("technologies", "Hydroacoustics\r\n\n  Sensor   systems \nhydroacoustics\n")).toEqual({
      ok: true,
      value: ["Hydroacoustics", "Sensor systems"],
    });
  });

  it("refuses an empty value, and values that are too long", () => {
    expect(parseValueInput("summary", "   ")).toMatchObject({ ok: false });
    expect(parseValueInput("offerings", "\n \n")).toMatchObject({ ok: false });
    expect(parseValueInput("summary", "x".repeat(MAX_SUMMARY_CHARS + 1))).toMatchObject({ ok: false });
    expect(parseValueInput("markets", Array.from({ length: MAX_ITEMS + 1 }, (_, i) => `Item ${i}`).join("\n"))).toMatchObject({ ok: false });
    expect(parseValueInput("markets", "y".repeat(200))).toMatchObject({ ok: false });
  });

  it("keeps the words as typed, in any language", () => {
    expect(parseValueInput("geography", "Karlskrona\nÖstersjön")).toEqual({ ok: true, value: ["Karlskrona", "Östersjön"] });
  });
});

describe("valueToInput and sameValue", () => {
  it("shows a list one item per line, and reads it back to the same value", () => {
    const value = ["Sonar", "Hydroacoustics"];
    const parsed = parseValueInput("technologies", valueToInput(value));
    expect(valueToInput(value)).toBe("Sonar\nHydroacoustics");
    expect(parsed.ok && sameValue(parsed.value, value)).toBe(true);
    expect(valueToInput(null)).toBe("");
  });

  it("ignores spacing but not order or words", () => {
    expect(sameValue("We  build sensors.", "We build sensors.")).toBe(true);
    expect(sameValue(["A", "B"], ["B", "A"])).toBe(false);
    expect(sameValue(["A"], "A")).toBe(false);
    expect(sameValue(null, null)).toBe(true);
    expect(sameValue(null, "A")).toBe(false);
  });
});

describe("defaultVisibility", () => {
  it("keeps the visibility of the claim being corrected", () => {
    expect(defaultVisibility({ status: "stated", visibility: "public" })).toBe("public");
    expect(defaultVisibility({ status: "user_corrected", visibility: "private" })).toBe("private");
  });

  it("starts a field the member fills in as private", () => {
    expect(defaultVisibility({ status: "missing", visibility: "public" })).toBe("private");
    expect(defaultVisibility(null)).toBe("private");
  });
});

describe("planEdit", () => {
  const stated = { id: "c1", value: ["Sonar"], status: "stated" as const, visibility: "public" as const };

  it("stores a changed value as a user-corrected claim and supersedes the field's active claims", () => {
    const plan = planEdit("technologies", stated, ["c1", "c0", "c1"], { value: ["Sonar", "Lidar"], visibility: "public" });
    expect(plan).toEqual({
      kind: "save",
      claim: {
        field: "technologies",
        value: ["Sonar", "Lidar"],
        status: "user_corrected",
        confidence: 1,
        updatedBy: "user",
        visibility: "public",
        reviewState: "active",
        supersedesId: "c1",
      },
      supersede: ["c1", "c0"],
    });
  });

  it("fills in a missing field as a user-corrected claim", () => {
    const missing = { id: "m1", value: null, status: "missing" as const, visibility: "public" as const };
    const plan = planEdit("statedPriorities", missing, ["m1"], { value: ["Sea trials 2027"], visibility: "private" });
    expect(plan).toMatchObject({ kind: "save", claim: { status: "user_corrected", visibility: "private", supersedesId: "m1" }, supersede: ["m1"] });
  });

  it("works for a field with no claim at all", () => {
    expect(planEdit("summary", null, [], { value: "We build sensors.", visibility: "private" })).toMatchObject({
      kind: "save",
      claim: { status: "user_corrected", supersedesId: null },
      supersede: [],
    });
  });

  it("records a kept profiler value as confirmed by the member", () => {
    const inferred = { id: "i1", value: ["Defence funding"], status: "inferred" as const, visibility: "public" as const };
    expect(planEdit("inferredInterests", inferred, ["i1"], { value: ["Defence  funding"], visibility: "public" })).toMatchObject({
      kind: "save",
      claim: { status: "user_confirmed" },
    });
  });

  it("does nothing when the member's own value is saved again unchanged", () => {
    const own = { id: "u1", value: "We build sensors.", status: "user_corrected" as const, visibility: "private" as const };
    expect(planEdit("summary", own, ["u1"], { value: "We build sensors.", visibility: "private" })).toEqual({ kind: "unchanged" });
    // Only the visibility changed: the member confirms the value under the new visibility.
    expect(planEdit("summary", own, ["u1"], { value: "We build sensors.", visibility: "public" })).toMatchObject({
      kind: "save",
      claim: { status: "user_confirmed", visibility: "public" },
    });
  });
});

describe("planReview", () => {
  const suggestion = { id: "s1", field: "offerings" as const, reviewState: "suggested" as const };
  const active = [
    { id: "a1", field: "offerings" as const, reviewState: "active" as const },
    { id: "a2", field: "summary" as const, reviewState: "active" as const },
  ];

  it("accepting activates the suggestion and supersedes the active claims of its field only", () => {
    expect(planReview("accept", suggestion, active)).toEqual({ activate: "s1", supersede: ["a1"], reject: null });
  });

  it("rejecting marks it rejected and touches nothing else", () => {
    expect(planReview("reject", suggestion, active)).toEqual({ activate: null, supersede: [], reject: "s1" });
  });

  it("refuses a suggestion that is no longer open", () => {
    expect(planReview("accept", { ...suggestion, reviewState: "active" }, active)).toHaveProperty("error");
    expect(planReview("reject", { ...suggestion, reviewState: "rejected" }, active)).toHaveProperty("error");
  });
});

describe("withPriority", () => {
  it("switches one priority on or off and keeps the fixed order", () => {
    expect(withPriority(["events"], "funding", true)).toEqual(["funding", "events"]);
    expect(withPriority(["funding", "events"], "funding", false)).toEqual(["events"]);
    expect(withPriority([], "market", false)).toEqual([]);
    expect(withPriority(["testing"], "testing", true)).toEqual(["testing"]);
  });

  it("drops values that are not priorities", () => {
    expect(withPriority(["funding", "bogus"], "partners", true)).toEqual(["funding", "partners"]);
  });
});
