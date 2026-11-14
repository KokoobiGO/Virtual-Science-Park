import { describe, expect, it } from "vitest";
import { IsoDate } from "../../schemas";
import { WpPosts, type WpPost } from "../tcl-events/wordpress";
import { parseBspNews } from "./parse";
import recordedJson from "./recorded.json";

/** The real answer of BSP's posts API (the ten newest posts), recorded 14 November 2026. */
const recorded = WpPosts.parse(recordedJson.data);

const post = (id: number, date_gmt: string, title = "Nyhet", html = "<p>Text.</p>"): WpPost => ({
  id,
  date_gmt,
  link: `https://www.bluesciencepark.se/aktuellt/nyhet-${id}/`,
  title: { rendered: title },
  content: { rendered: html },
});

describe("parseBspNews on the recorded response", () => {
  const items = parseBspNews(recorded, new Date("2026-11-14T10:00:00Z"));

  it("keeps the posts of the last 45 days, newest first", () => {
    expect(items.map((i) => i.externalId)).toEqual(["23455", "23438", "23424", "23325"]);
  });

  it("maps a post to a news item", () => {
    expect(items[0]).toMatchObject({
      externalId: "23455",
      kind: "news",
      title: "Blue Science Park och Blekinge Business Incubator bildar gemensam science park – Pär Johansson blir VD",
      url: "https://www.bluesciencepark.se/aktuellt/blue-science-park-och-blekinge-business-incubator-bildar-gemensam-science-park-par-johansson-blir-vd/",
      publishedAt: "2026-11-13T08:51:46.000Z",
    });
    expect(items[0].description).toMatch(/^Med ambitionen att göra Blekinge/);
  });

  it("gives plain text descriptions of at most about 2000 characters", () => {
    for (const item of items) {
      expect(item.description, item.externalId).toBeTruthy();
      expect(item.description!.length, item.externalId).toBeLessThanOrEqual(2000);
      expect(item.description, item.externalId).not.toMatch(/<\/?[a-z]|&nbsp;|&amp;|&#\d+;/);
      expect(IsoDate.safeParse(item.publishedAt).success, item.externalId).toBe(true);
    }
  });
});

describe("parseBspNews rules", () => {
  const now = new Date("2026-11-14T10:00:00Z");

  it("decodes HTML entities in titles", () => {
    const [item] = parseBspNews([post(1, "2026-11-10T08:00:00", "R&amp;D &#8211; ny medlem i &#8221;Blue&#8221;")], now);
    expect(item.title).toBe("R&D – ny medlem i ”Blue”");
  });

  it("returns at most 30 items, the newest", () => {
    const many = Array.from({ length: 40 }, (_, i) => post(i + 1, `2026-11-${String(Math.floor(i / 4) + 1).padStart(2, "0")}T${String(10 + (i % 4)).padStart(2, "0")}:00:00`));
    const items = parseBspNews(many, now);
    expect(items).toHaveLength(30);
    expect(items[0].externalId).toBe("40");
    expect(items[29].externalId).toBe("11");
  });

  it("drops a post just older than 45 days", () => {
    const items = parseBspNews([post(1, "2026-09-30T09:59:00"), post(2, "2026-09-30T10:01:00")], now);
    expect(items.map((i) => i.externalId)).toEqual(["2"]);
  });
});
