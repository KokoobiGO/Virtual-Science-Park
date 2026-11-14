/**
 * Curated testbed list (A12).
 *
 * data/testbeds.seed.json is hand-entered: the team's curated testbeds plus a
 * one-off pass over Vinnova's national testbed list, each rewritten from the
 * official page and marked verified or not. A record whose link did not work
 * when checked stays in the file with `linkOk: false` and is left out here.
 * `town`, `lat` and `lon` say where a facility is, for the map; they are not
 * part of the collected opportunity.
 */
import { z } from "zod";
import testbedsJson from "../../../data/testbeds.seed.json";
import { OpportunityTag } from "../../schemas";
import type { CollectedOpportunity, Collector } from "../types";

const FILE = "data/testbeds.seed.json";

export const TestbedRecord = z.strictObject({
  externalId: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().trim().min(1),
  url: z.url(),
  description: z.string().trim().min(1),
  tags: z.array(OpportunityTag).min(1),
  /** Contact page, role or department; a name or email only when the official page prints it. */
  contact: z.string().trim().min(1).optional(),
  /** True when an official page confirmed the testbed exists and outside companies can use or contact it. */
  verified: z.boolean(),
  /** False when the link was dead or could not be checked; such records are not collected. */
  linkOk: z.boolean(),
  checkedAt: z.iso.date(),
  /** Where the entry came from: the team's own table or Vinnova's testbed list. */
  origin: z.enum(["curated", "vinnova_list"]),
  /** Why a record is unverified or its link is not ok, and where facts came from. Not collected. */
  note: z.string().trim().min(1).optional(),
  /** The town the facility is in, from the address its own page gives. Not collected: for the map. */
  town: z.string().trim().min(1).optional(),
  /** The town's centre (inside Sweden), town-level accuracy only. Set together with `town`. */
  lat: z.number().min(55).max(69.1).optional(),
  lon: z.number().min(10.9).max(24.2).optional(),
}).refine(hasWholePlaceOrNone, { message: "town, lat and lon go together: set all three or none" });
export type TestbedRecord = z.infer<typeof TestbedRecord>;

function hasWholePlaceOrNone(r: { town?: string; lat?: number; lon?: number }): boolean {
  const set = [r.town, r.lat, r.lon].filter((v) => v !== undefined).length;
  return set === 0 || set === 3;
}

/** Check the seed data; throws a clear error on the first bad record or a repeated externalId. */
export function parseTestbeds(data: unknown): TestbedRecord[] {
  const parsed = z.array(TestbedRecord).safeParse(data);
  if (!parsed.success) throw new Error(`${FILE} has a bad record:\n${z.prettifyError(parsed.error)}`);
  const seen = new Set<string>();
  for (const record of parsed.data) {
    if (seen.has(record.externalId)) throw new Error(`${FILE}: externalId "${record.externalId}" is used twice.`);
    seen.add(record.externalId);
  }
  return parsed.data;
}

/** Records with a working link, as testbed opportunities. */
export function toOpportunities(records: TestbedRecord[]): CollectedOpportunity[] {
  return records
    .filter((r) => r.linkOk)
    .map((r): CollectedOpportunity => ({
      externalId: r.externalId,
      kind: "testbed",
      title: r.title,
      url: r.url,
      description: r.description,
      ...(r.contact ? { contact: r.contact } : {}),
      verified: r.verified,
      tags: r.tags,
    }));
}

export const testbedsCollector: Collector = {
  source: "testbeds",
  label: "Curated testbed list",
  async collect() {
    const records = parseTestbeds(testbedsJson);
    const items = toOpportunities(records);
    const checkedAt = records.map((r) => r.checkedAt).sort().at(-1);
    const left = records.length - items.length;
    return {
      items,
      state: "simulated",
      message: `Hand-entered by the team, links checked ${checkedAt}; ${left} of ${records.length} entries are left out because their link was dead or could not be checked.`,
    };
  },
};
