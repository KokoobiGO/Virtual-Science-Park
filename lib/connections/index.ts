/**
 * Connection finder (A28): pairs of members with a stated basis, from public
 * profile fields only, for BSP staff.
 *
 *   candidates.ts  the most similar pairs by public embedding
 *   claims.ts      the public claims, the only claims the finder reads
 *   prompt.ts      the judge prompt and the short claim ids (C1, C2, ...)
 *   judge.ts       one model call per pair
 *   verify.ts      the checks in code after the model answers
 *   find.ts        judge a few pairs at a time (job and script)
 *   store.ts       upsert what passed, delete what this run did not confirm
 *
 * This file holds only the fixed sentence, with no server imports, so a page
 * or a client component can import it.
 */

/** Shown with every pair. Not stored per row. */
export const CONNECTION_DISCLAIMER = "Neither company has expressed interest. This is a suggestion from public profile information only.";
