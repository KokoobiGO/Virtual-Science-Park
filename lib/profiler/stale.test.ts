import { describe, expect, it } from "vitest";
import { isStale, STALE_AFTER_DAYS } from "./stale";

const NOW = new Date("2026-11-14T12:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

describe("isStale", () => {
  it("flags claims after 90 days", () => {
    expect(STALE_AFTER_DAYS).toBe(90);
  });

  it("is not stale at exactly 90 days", () => {
    expect(isStale(new Date(NOW.getTime() - 90 * DAY_MS), NOW)).toBe(false);
  });

  it("is stale one millisecond after 90 days", () => {
    expect(isStale(new Date(NOW.getTime() - 90 * DAY_MS - 1), NOW)).toBe(true);
  });

  it("is not stale for a claim updated today, or one dated in the future", () => {
    expect(isStale(NOW, NOW)).toBe(false);
    expect(isStale(new Date(NOW.getTime() + DAY_MS), NOW)).toBe(false);
  });

  it("uses the current time when no time is given", () => {
    expect(isStale(new Date(Date.now() - 91 * DAY_MS))).toBe(true);
    expect(isStale(new Date(Date.now() - 89 * DAY_MS))).toBe(false);
  });
});
