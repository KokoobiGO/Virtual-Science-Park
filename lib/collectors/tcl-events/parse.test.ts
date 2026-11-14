import { describe, expect, it } from "vitest";
import { IsoDate } from "../../schemas";
import { detectFormat, NO_DATE_PREFIX, parseTclEvents } from "./parse";
import recordedJson from "./recorded.json";
import { WpPosts, type WpPost } from "./wordpress";

/** The real answer of TCL's event API, recorded 14 November 2026. */
const recorded = WpPosts.parse(recordedJson.data);

const post = (title: string, html: string, date_gmt: string): WpPost => ({
  id: 1,
  date_gmt,
  link: "https://techconceptlab.com/event/test/",
  title: { rendered: title },
  content: { rendered: html },
});

describe("parseTclEvents on the recorded response", () => {
  it("keeps only the upcoming event on 14 November 2026", () => {
    const items = parseTclEvents(recorded, new Date("2026-11-14T10:00:00Z"));
    expect(items).toHaveLength(1);
    const [item] = items;
    expect(item).toMatchObject({
      externalId: "7961",
      kind: "event",
      title: "Bygg en AI-agent för verksamheten",
      url: "https://techconceptlab.com/event/bygg-en-ai-agent-for-verksamheten/",
      eventDate: "2026-11-19",
      publishedAt: "2026-10-20T05:28:52.000Z",
      format: "in_person",
    });
    expect(item.description).toMatch(/^Bygg en AI-agent för din verksamhet/);
    expect(item.description).not.toMatch(/<|&amp;|&#\d+;/);
    expect(item.description!.length).toBeLessThanOrEqual(2000);
  });

  it("lists upcoming events in date order", () => {
    const items = parseTclEvents(recorded, new Date("2026-10-01T10:00:00Z"));
    expect(items.map((i) => [i.externalId, i.eventDate])).toEqual([
      ["7714", "2026-10-07"],
      ["7961", "2026-11-19"],
    ]);
  });

  it("keeps a new post with no date, labelled, and drops an old one", () => {
    // 6904 (published 22 April) has no date in its text; 6620 (published 10 March) neither.
    const items = parseTclEvents(recorded, new Date("2026-05-01T10:00:00Z"));
    const undated = items.filter((i) => !i.eventDate);
    expect(undated.map((i) => i.externalId)).toEqual(["6904"]);
    expect(undated[0].description!.startsWith(NO_DATE_PREFIX)).toBe(true);
    expect(undated[0].description!.length).toBeLessThanOrEqual(2000);
  });

  it("drops cancelled events and decodes titles", () => {
    const items = parseTclEvents(recorded, new Date("2026-02-01T10:00:00Z"));
    expect(items.map((i) => i.externalId)).not.toContain("6640");
    expect(items.find((i) => i.externalId === "6611")?.title).toBe("Future Lab Part 1: Book Launch – More than Human \u{1F4D6}");
    expect(items.find((i) => i.externalId === "6388")?.eventDate).toBe("2026-02-12T10:00:00+01:00");
  });

  it("gives dates the shared contract accepts", () => {
    for (const item of parseTclEvents(recorded, new Date("2026-01-01T10:00:00Z"))) {
      expect(IsoDate.safeParse(item.publishedAt).success, item.externalId).toBe(true);
      if (item.eventDate) expect(IsoDate.safeParse(item.eventDate).success, item.externalId).toBe(true);
    }
  });
});

describe("parseTclEvents rules", () => {
  const now = new Date("2026-11-14T10:00:00Z");

  it("prefers a date in the title over one in the text", () => {
    const [item] = parseTclEvents(
      [post("Marin-onsdag 2 december", "<p>Anmälan senast 25 november.</p>", "2026-11-01T09:00:00")],
      now,
    );
    expect(item.eventDate).toBe("2026-12-02");
  });

  it("keeps an event happening today", () => {
    const items = parseTclEvents([post("Lunch", "<p>Idag 14 november kl. 12.00</p>", "2026-11-01T09:00:00")], now);
    expect(items[0]?.eventDate).toBe("2026-11-14T12:00:00+01:00");
  });

  it("drops an undated post older than 45 days", () => {
    const items = parseTclEvents([post("Workshop", "<p>Mer info kommer.</p>", "2026-09-01T09:00:00")], now);
    expect(items).toEqual([]);
  });

  it("clips a long description to about 2000 characters", () => {
    const html = `<p>12 december 2026</p>${"<p>Ord och mer ord.</p>".repeat(300)}`;
    const [item] = parseTclEvents([post("Lång", html, "2026-11-01T09:00:00")], now);
    expect(item.description!.length).toBeLessThanOrEqual(2000);
    expect(item.description!.endsWith("…")).toBe(true);
  });
});

describe("detectFormat", () => {
  it("reads only clear wording", () => {
    expect(detectFormat("Plats - Fysiskt i Karlskrona.")).toBe("in_person");
    expect(detectFormat("The session is held in person at The Pot.")).toBe("in_person");
    expect(detectFormat("Seminariet sänds digitalt via Teams.")).toBe("online");
    expect(detectFormat("A webinar on AI.")).toBe("online");
    expect(detectFormat("Delta på plats eller via Zoom.")).toBe("hybrid");
    expect(detectFormat("Eventet är hybrid.")).toBe("hybrid");
    expect(detectFormat("Vi erbjuder digitalt stöd och online-tjänster.")).toBeUndefined();
    expect(detectFormat("Välkommen till Black Box, Ericsson.")).toBeUndefined();
  });
});
