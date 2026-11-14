/**
 * Regional funding, hand-entered (A13).
 *
 * data/regional-funding.json holds support a small tech company in Blekinge
 * can apply for at any time or in regular rounds: Region Blekinge's business
 * grants, Almi's loans and verification funding, and Interreg South Baltic's
 * project calls. Every record was written from the official page on the date
 * in `checkedAt`. Tags are left to the tagger (A14).
 */
import { z } from "zod";
import regionalJson from "../../../data/regional-funding.json";
import type { CollectedOpportunity, Collector } from "../types";

const FILE = "data/regional-funding.json";

export const RegionalRecord = z.strictObject({
  externalId: z.string().regex(/^[a-z0-9-]+$/),
  /** Who offers the support; also the start of the collected title. */
  organisation: z.string().trim().min(1),
  /** The support's name, without the organisation. */
  title: z.string().trim().min(1),
  url: z.url(),
  description: z.string().trim().min(1),
  /** Only what the official page states. */
  eligibilityText: z.string().trim().min(1).optional(),
  contact: z.string().trim().min(1).optional(),
  /** Only when the page states a real date; always-open support has none. */
  deadline: z.iso.date().optional(),
  checkedAt: z.iso.date(),
});
export type RegionalRecord = z.infer<typeof RegionalRecord>;

/** Check the data; throws a clear error on the first bad record or a repeated externalId. */
export function parseRegional(data: unknown): RegionalRecord[] {
  const parsed = z.array(RegionalRecord).safeParse(data);
  if (!parsed.success) throw new Error(`${FILE} has a bad record:\n${z.prettifyError(parsed.error)}`);
  const seen = new Set<string>();
  for (const record of parsed.data) {
    if (seen.has(record.externalId)) throw new Error(`${FILE}: externalId "${record.externalId}" is used twice.`);
    seen.add(record.externalId);
  }
  return parsed.data;
}

export function toOpportunities(records: RegionalRecord[]): CollectedOpportunity[] {
  return records.map((r): CollectedOpportunity => ({
    externalId: r.externalId,
    kind: "funding",
    title: `${r.organisation}: ${r.title}`,
    url: r.url,
    description: r.description,
    ...(r.eligibilityText ? { eligibilityText: r.eligibilityText } : {}),
    ...(r.contact ? { contact: r.contact } : {}),
    ...(r.deadline ? { deadline: r.deadline } : {}),
  }));
}

export const regionalCollector: Collector = {
  source: "regional",
  label: "Regional funding (hand-entered)",
  async collect() {
    const records = parseRegional(regionalJson);
    const checkedAt = records.map((r) => r.checkedAt).sort().at(-1);
    return {
      items: toOpportunities(records),
      state: "simulated",
      message: `Hand-entered by the team, links checked ${checkedAt}.`,
    };
  },
};
