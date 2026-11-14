/**
 * Stale claims (A23): a claim not updated for more than 90 days is flagged
 * stale in the UI. Nothing is stored; the UI asks isStale() with the claim's
 * updatedAt.
 */

export const STALE_AFTER_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

/** True when `updatedAt` is more than 90 days before `now`. Exactly 90 days is not stale yet. */
export function isStale(updatedAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - updatedAt.getTime() > STALE_AFTER_DAYS * DAY_MS;
}
