import { describe, expect, it } from "vitest";
import { judgeSources, type SourceStatusRow } from "@/lib/sources/health";
import { sourceSummary, statusDate } from "./data-status-panel";

const now = new Date("2026-11-14T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

const row = (over: Partial<SourceStatusRow> & Pick<SourceStatusRow, "source" | "state">): SourceStatusRow => ({
  label: over.source,
  lastSuccessAt: null,
  cachedAt: null,
  itemCount: 1,
  message: null,
  ...over,
});

describe("sourceSummary", () => {
  it("counts the sources per label, in label order", () => {
    const entries = judgeSources(
      [
        row({ source: "vinnova", state: "live", lastSuccessAt: hoursAgo(5) }),
        row({ source: "bsp_news", state: "live", lastSuccessAt: hoursAgo(3) }),
        row({ source: "tcl_events", state: "live", lastSuccessAt: hoursAgo(72) }),
        row({ source: "eu_funding", state: "cached", cachedAt: hoursAgo(100) }),
        row({ source: "regional", state: "simulated" }),
      ],
      now,
    );
    expect(sourceSummary(entries)).toBe("5 sources: 2 live, 1 stale, 1 cached copy, 1 hand-entered.");
  });

  it("says when there is nothing yet", () => {
    expect(sourceSummary([])).toBe("No sources yet.");
  });
});

describe("statusDate", () => {
  const entry = { cachedAt: hoursAgo(100), lastSuccessAt: hoursAgo(2) };

  it("shows the copy's date for a cached source and the last read otherwise", () => {
    expect(statusDate(entry, "cached")).toBe(entry.cachedAt);
    expect(statusDate(entry, "live")).toBe(entry.lastSuccessAt);
    expect(statusDate(entry, "stale")).toBe(entry.lastSuccessAt);
    expect(statusDate(entry, "hand_entered")).toBeNull();
  });
});
