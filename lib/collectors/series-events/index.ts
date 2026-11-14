/**
 * BSP and MTC event series (A25): recurring events with no fixed next date,
 * hand-entered in data/series-events.json from the official pages. The state
 * is "simulated" (hand-entered), so the UI labels them.
 */
import { z } from "zod";
import seriesJson from "../../../data/series-events.json";
import { IsoDate } from "../../schemas";
import type { CollectedOpportunity, Collector } from "../types";

export const NO_DATE_PREFIX = "Recurring, no date set. ";

export const SeriesEvent = z.object({
  externalId: z.string().regex(/^[a-z0-9-]+$/),
  organiser: z.string().min(1),
  title: z.string().min(1),
  /** An official page that describes the series. */
  url: z.url(),
  /** Two or three plain English sentences. */
  description: z.string().min(1),
  /** Only when the official page says how often, e.g. "yearly, usually in spring". */
  recurrence: z.string().min(1).optional(),
  /** Only when a real upcoming date is published. */
  nextDate: IsoDate.optional(),
  /** When the link and the facts were last checked. */
  checkedAt: z.iso.date(),
});
export type SeriesEvent = z.infer<typeof SeriesEvent>;

export function loadSeriesEvents(): SeriesEvent[] {
  const series = z.array(SeriesEvent).min(1).parse(seriesJson);
  if (new Set(series.map((s) => s.externalId)).size !== series.length) throw new Error("Duplicate externalId in data/series-events.json.");
  return series;
}

export function toOpportunity(series: SeriesEvent): CollectedOpportunity {
  const details = [series.description, series.recurrence && `How often: ${series.recurrence}.`, `Organiser: ${series.organiser}.`].filter(Boolean).join(" ");
  return {
    externalId: series.externalId,
    kind: "event",
    title: series.title,
    url: series.url,
    description: series.nextDate ? details : NO_DATE_PREFIX + details,
    ...(series.nextDate ? { eventDate: series.nextDate } : {}),
  };
}

export const seriesEventsCollector: Collector = {
  source: "bsp_events",
  label: "BSP and MTC event series",
  async collect() {
    const series = loadSeriesEvents();
    const checked = series.map((s) => s.checkedAt).sort().at(-1);
    return {
      items: series.map(toOpportunity),
      state: "simulated",
      message: `Hand-entered by the team, links checked ${checked}.`,
    };
  },
};
