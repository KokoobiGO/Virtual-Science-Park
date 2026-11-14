/**
 * The contract every collector follows (A9 to A13, A25, A26).
 *
 * A collector reads one outside source and returns opportunities. It never
 * touches the database: `storeCollected()` in ./store.ts does that, the same
 * way for every source.
 */
import type { OpportunityFormat, OpportunityKind, OpportunityTag, SourceState } from "../schemas";

/** One opportunity as a collector found it. Dates are ISO strings (date or date-time with offset). */
export type CollectedOpportunity = {
  /** Stable id from the source, or the URL when the source has none. Unique per collector. */
  externalId: string;
  kind: OpportunityKind;
  title: string;
  url: string;
  /** Call text or event blurb, plain text. Feeds the tags and the embedding (A14). */
  description?: string;
  publishedAt?: string;
  opensAt?: string;
  deadline?: string;
  eventDate?: string;
  format?: OpportunityFormat;
  audience?: string;
  eligibilityText?: string;
  contact?: string;
  /** Testbeds only. */
  verified?: boolean;
  /** Only for hand-curated lists that come with tags. Other sources leave it out; A14 tags them. */
  tags?: OpportunityTag[];
};

export type CollectResult = {
  items: CollectedOpportunity[];
  /**
   * "live": read from the source just now. "cached": the source failed or
   * DEMO_MODE=cached, so the recorded copy was used. "simulated": hand-entered.
   */
  state: SourceState;
  /** For "cached": when the recorded copy was taken (ISO date-time). */
  cachedAt?: string;
  /** One plain sentence for the data status panel, e.g. why the cached copy was used. */
  message?: string;
};

export type Collector = {
  /** Key in source_status and on the command line, e.g. "vinnova". Lower case, a-z and _. */
  source: string;
  /** Display name stored on every opportunity and shown in the UI, e.g. "Vinnova". */
  label: string;
  collect(): Promise<CollectResult>;
};
