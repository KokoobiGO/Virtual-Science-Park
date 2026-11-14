/**
 * Member list import (A2): every BSP member into the companies table. Jobs and
 * scripts only: it writes with getDb(), which bypasses row-level security.
 *
 * The list comes from the site's WordPress API (the `medlem` post type), the
 * facts from each member's page. Rows are matched on the slug, so a second run
 * updates instead of duplicating, and the three gold members keep `is_gold`.
 */
import * as cheerio from "cheerio/slim";
import { getDb } from "../db";
import { companies } from "../db/schema";
import { fetchPage, USER_AGENT } from "../fetcher/fetch-page";
import { parseMemberPage } from "./parse";

export const MEMBER_LIST_API = "https://www.bluesciencepark.se/wp-json/wp/v2/medlem";

export type MemberRef = { slug: string; name: string; memberPage: string };

export type ImportedMember = { slug: string; name: string; website: string | null } | { slug: string; error: string };

/** Every member in BSP's list: slug, name and member page address. */
export async function listMembers(): Promise<MemberRef[]> {
  const members: MemberRef[] = [];
  for (let page = 1; ; page++) {
    const res = await fetch(`${MEMBER_LIST_API}?per_page=100&page=${page}&_fields=slug,link,title`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`BSP member list answered ${res.status}`);
    const rows = (await res.json()) as { slug: string; link: string; title: { rendered: string } }[];
    for (const row of rows) {
      // The title is HTML: "R&amp;D" must become "R&D".
      members.push({ slug: row.slug, name: cheerio.load(row.title.rendered).text().trim(), memberPage: row.link });
    }
    if (page >= Number(res.headers.get("x-wp-totalpages") ?? 1)) break;
  }
  if (!members.length) throw new Error("BSP member list is empty");
  return members;
}

/** Fetches one member page and writes the company row. */
export async function importMember(member: MemberRef): Promise<ImportedMember> {
  try {
    const page = await fetchPage(member.memberPage);
    const facts = parseMemberPage(page.html);
    const row = {
      name: facts.name ?? member.name,
      website: facts.website,
      websiteMissing: facts.website === null,
      memberPage: member.memberPage,
      bspDescription: facts.description,
      industry: facts.industry,
      employees: facts.employees,
      foundedYear: facts.foundedYear,
      town: facts.town,
    };
    await getDb()
      .insert(companies)
      .values({ slug: member.slug, ...row })
      .onConflictDoUpdate({ target: companies.slug, set: { ...row, updatedAt: new Date() } });
    return { slug: member.slug, name: row.name, website: row.website };
  } catch (error) {
    return { slug: member.slug, error: (error as Error).message };
  }
}

/** Imports a batch, a few pages at a time, so we never hammer the BSP site. */
export async function importMembers(members: MemberRef[], concurrency = 4): Promise<ImportedMember[]> {
  const results: ImportedMember[] = [];
  const queue = [...members];
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      for (let member = queue.shift(); member; member = queue.shift()) results.push(await importMember(member));
    }),
  );
  return results;
}
