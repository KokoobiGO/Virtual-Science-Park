import { describe, expect, it } from "vitest";
import { CLAIM_STATUS_META } from "./claim-badge";
import {
  DATA_STATUS_META,
  dataStatusFromState,
  dataStatusFromVerdict,
  dataStatusText,
  formatStatusDate,
  itemDataStatus,
} from "./data-status-label";

describe("dataStatusText", () => {
  const copy = new Date("2026-11-10T02:00:00Z");

  it("says the date of a cached copy", () => {
    expect(dataStatusText("cached", copy)).toBe("Cached copy · 10 Nov 2026");
    expect(dataStatusText("cached", null)).toBe("Cached copy · date unknown");
  });

  it("says when a live source was read", () => {
    expect(dataStatusText("live", copy)).toBe("Live · read 10 Nov 2026");
    expect(dataStatusText("live")).toBe("Live");
    expect(dataStatusText("stale", copy)).toBe("Stale · last read 10 Nov 2026");
    expect(dataStatusText("stale", null)).toBe("Stale · never read");
  });

  it("labels simulated and hand-entered data without a date", () => {
    expect(dataStatusText("simulated", copy)).toBe("Simulated");
    expect(dataStatusText("hand_entered")).toBe("Hand-entered");
  });

  it("uses Swedish time for the day", () => {
    // 23:30 UTC on 9 Nov is already 10 Nov in Stockholm.
    expect(formatStatusDate("2026-11-09T23:30:00Z")).toBe("10 Nov 2026");
    expect(formatStatusDate("not a date")).toBeNull();
    expect(formatStatusDate(undefined)).toBeNull();
  });
});

describe("mapping from the stored data", () => {
  it("turns health verdicts and states into labels", () => {
    expect(dataStatusFromVerdict("ok")).toBe("live");
    expect(dataStatusFromVerdict("stale")).toBe("stale");
    expect(dataStatusFromVerdict("cached")).toBe("cached");
    expect(dataStatusFromVerdict("hand_entered")).toBe("hand_entered");
    expect(dataStatusFromState("simulated")).toBe("simulated");
  });
});

describe("itemDataStatus", () => {
  it("labels an opportunity from a hand-entered source as hand-entered", () => {
    expect(itemDataStatus({ simulated: true, externalId: "region-blekinge-1" })).toBe("hand_entered");
    expect(itemDataStatus({ simulated: false, sourceState: "simulated" })).toBe("hand_entered");
  });

  it("labels the team's sample fixtures as simulated", () => {
    expect(itemDataStatus({ simulated: true, externalId: "fixture-vinnova-1" })).toBe("simulated");
  });

  it("labels an item from a source that shows its recorded copy as cached", () => {
    expect(itemDataStatus({ simulated: false, sourceState: "cached" })).toBe("cached");
  });

  it("leaves an item read live unlabelled", () => {
    expect(itemDataStatus({ simulated: false, sourceState: "live" })).toBeNull();
    expect(itemDataStatus({ simulated: false })).toBeNull();
  });
});

describe("labels never rely on colour alone", () => {
  it("gives every data status its own word and icon", () => {
    const metas = Object.values(DATA_STATUS_META);
    expect(new Set(metas.map((m) => m.label)).size).toBe(metas.length);
    expect(new Set(metas.map((m) => m.icon)).size).toBe(metas.length);
  });

  it("gives Stated, Inferred and Missing their own word, icon and colour", () => {
    const three = [CLAIM_STATUS_META.stated, CLAIM_STATUS_META.inferred, CLAIM_STATUS_META.missing];
    expect(three.map((m) => m.label)).toEqual(["Stated", "Inferred", "Missing"]);
    expect(new Set(three.map((m) => m.icon)).size).toBe(3);
    expect(new Set(three.map((m) => m.variant)).size).toBe(3);
  });
});
