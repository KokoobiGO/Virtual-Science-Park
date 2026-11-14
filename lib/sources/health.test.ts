import { describe, expect, it } from "vitest";
import { judgeSources, sourceVerdict, STALE_SOURCE_HOURS, type SourceStatusRow } from "./health";

const NOW = new Date("2026-11-14T12:00:00Z");
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000);

const row = (overrides: Partial<SourceStatusRow>): SourceStatusRow => ({
  source: "vinnova",
  label: "Vinnova",
  state: "live",
  lastSuccessAt: hoursAgo(1),
  cachedAt: null,
  itemCount: 12,
  message: null,
  ...overrides,
});

describe("sourceVerdict", () => {
  it("calls a live source with a recent success ok", () => {
    expect(sourceVerdict(row({}), NOW)).toBe("ok");
  });

  it("still calls it ok at exactly 48 hours", () => {
    expect(STALE_SOURCE_HOURS).toBe(48);
    expect(sourceVerdict(row({ lastSuccessAt: hoursAgo(48) }), NOW)).toBe("ok");
  });

  it("calls a live source stale once the last success is older than 48 hours", () => {
    expect(sourceVerdict(row({ lastSuccessAt: new Date(hoursAgo(48).getTime() - 1) }), NOW)).toBe("stale");
  });

  it("calls a live source that never succeeded stale", () => {
    expect(sourceVerdict(row({ lastSuccessAt: null }), NOW)).toBe("stale");
  });

  it("calls a cached source cached, however old its last success", () => {
    expect(sourceVerdict(row({ state: "cached", lastSuccessAt: null }), NOW)).toBe("cached");
    expect(sourceVerdict(row({ state: "cached", lastSuccessAt: hoursAgo(1) }), NOW)).toBe("cached");
  });

  it("calls a simulated source hand_entered", () => {
    expect(sourceVerdict(row({ state: "simulated", lastSuccessAt: hoursAgo(500) }), NOW)).toBe("hand_entered");
  });
});

describe("judgeSources", () => {
  it("gives one entry per row, sorted by source, keeping the copy's date and the message", () => {
    const cachedAt = new Date("2026-11-01T10:00:00Z");
    const result = judgeSources(
      [
        row({ source: "vinnova" }),
        row({ source: "eu_funding", label: "EU Funding", state: "cached", cachedAt, message: "The live source failed (503)." }),
      ],
      NOW,
    );
    expect(result.map((r) => [r.source, r.verdict])).toEqual([
      ["eu_funding", "cached"],
      ["vinnova", "ok"],
    ]);
    expect(result[0]).toMatchObject({ label: "EU Funding", cachedAt, message: "The live source failed (503).", itemCount: 12 });
  });

  it("gives nothing for no rows", () => {
    expect(judgeSources([], NOW)).toEqual([]);
  });
});
