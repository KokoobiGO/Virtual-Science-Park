import { describe, expect, it } from "vitest";
import { loadSeriesEvents, NO_DATE_PREFIX, seriesEventsCollector, toOpportunity, type SeriesEvent } from "./index";

describe("BSP and MTC event series", () => {
  it("checks data/series-events.json", () => {
    const series = loadSeriesEvents();
    expect(series.length).toBeGreaterThanOrEqual(4);
    expect(series.length).toBeLessThanOrEqual(8);
  });

  it("collects every series as a hand-entered event", async () => {
    const result = await seriesEventsCollector.collect();
    expect(result.state).toBe("simulated");
    expect(result.message).toMatch(/^Hand-entered by the team, links checked \d{4}-\d{2}-\d{2}\.$/);
    expect(result.items).toHaveLength(loadSeriesEvents().length);
    for (const item of result.items) {
      expect(item.kind).toBe("event");
      if (!item.eventDate) expect(item.description?.startsWith(NO_DATE_PREFIX), item.externalId).toBe(true);
    }
  });

  it("sets the event date only when a next date is published", () => {
    const base: SeriesEvent = {
      externalId: "test-series",
      organiser: "Blue Science Park",
      title: "Test series",
      url: "https://www.bluesciencepark.se/event/",
      description: "Two sentences. Here.",
      recurrence: "yearly",
      checkedAt: "2026-11-14",
    };
    expect(toOpportunity(base)).toEqual({
      externalId: "test-series",
      kind: "event",
      title: "Test series",
      url: "https://www.bluesciencepark.se/event/",
      description: "Recurring, no date set. Two sentences. Here. How often: yearly. Organiser: Blue Science Park.",
    });
    const dated = toOpportunity({ ...base, nextDate: "2027-05-12" });
    expect(dated.eventDate).toBe("2027-05-12");
    expect(dated.description).toBe("Two sentences. Here. How often: yearly. Organiser: Blue Science Park.");
  });
});
