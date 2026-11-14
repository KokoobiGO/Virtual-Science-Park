/**
 * Reads the facts on one BSP member page (A2), e.g.
 * https://www.bluesciencepark.se/medlem/techinova/.
 *
 * Checked against all 56 member pages on 2026-11-14: each has the name in an
 * <h1>, a description, and two lists side by side: the labels (Bransch, Antal
 * anställda, Grundat, Ort, Webb) and their values in the same order. A value
 * may be empty. Values are matched to labels by position, then read by label
 * name, so a changed order still works.
 */
import * as cheerio from "cheerio";

export type MemberFacts = {
  name: string | null;
  /** BSP's own description of the member, in Swedish. */
  description: string | null;
  /** One or more, comma-separated, as on the page. */
  industry: string | null;
  /** A size band such as "11-50" or "200+". */
  employees: string | null;
  foundedYear: number | null;
  /** One or more, comma-separated, as on the page. */
  town: string | null;
  website: string | null;
};

const clean = (text: string) => text.replace(/\s+/g, " ").trim() || null;

export function parseMemberPage(html: string): MemberFacts {
  const $ = cheerio.load(html);
  const template = $('[data-elementor-type="single-post"]').first();
  const root = template.length ? template : $("body");

  const lists = root.find("ul");
  const labelList = lists.filter((_, ul) => /Webb|Bransch|Grundat/.test($(ul).text())).first();
  const valueItems = lists.eq(lists.index(labelList) + 1).children("li");

  const facts = new Map<string, { text: string | null; href: string | null }>();
  if (labelList.length) {
    labelList.children("li").each((i, li) => {
      const value = valueItems.eq(i);
      const label = clean($(li).text())?.toLowerCase();
      if (label) facts.set(label, { text: clean(value.text()), href: clean(value.find("a[href]").attr("href") ?? "") });
    });
  }

  const year = Number(facts.get("grundat")?.text);
  const href = facts.get("webb")?.href;
  return {
    name: clean(root.find("h1").first().text()),
    description: clean(root.find('[data-widget_type^="text-editor"]').first().text()),
    industry: facts.get("bransch")?.text ?? null,
    employees: facts.get("antal anställda")?.text ?? null,
    foundedYear: Number.isInteger(year) && year > 1000 && year <= new Date().getFullYear() ? year : null,
    town: facts.get("ort")?.text ?? null,
    website: href && /^https?:\/\//i.test(href) ? href : null,
  };
}
