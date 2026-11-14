/**
 * The Your-week page after a change (C8): it polls whether the cards were built
 * again, and when they were, the cards slide to their new places and a line
 * says what changed. Pure, so the rules are unit-tested; app/week/week-live.tsx
 * does the browser part and app/api/week/route.ts answers the poll.
 *
 * The page polls instead of using Supabase Realtime: week_cards is not in the
 * supabase_realtime publication, and adding it takes a migration.
 */
import type { WeekStatus } from "./load";

/** How long after a profile change the page waits for the new cards before it stops saying so. */
export const PENDING_FOR_MS = 15 * 60_000;
/** Poll this often while new cards are on their way... */
export const POLL_PENDING_MS = 4_000;
/** ...and this often otherwise (feedback or the nightly run may rebuild them too). */
export const POLL_IDLE_MS = 30_000;

export const PENDING_TEXT = "Your profile changed: your cards are being re-ranked. This page updates by itself.";

/** What the page and the poll route send to the browser. */
export type WeekStatusJson = { weekOf: string | null; builtAt: string | null; profileChangedAt: string | null; pending: boolean };

/** The profile changed after the cards were built, recently enough that the new ones are still on their way. */
export function rerankPending({ builtAt, profileChangedAt }: Pick<WeekStatus, "builtAt" | "profileChangedAt">, now: Date): boolean {
  if (!profileChangedAt || now.getTime() - profileChangedAt.getTime() > PENDING_FOR_MS) return false;
  return !builtAt || profileChangedAt.getTime() > builtAt.getTime();
}

export function statusJson(status: WeekStatus, now: Date): WeekStatusJson {
  return {
    weekOf: status.weekOf,
    builtAt: status.builtAt?.toISOString() ?? null,
    profileChangedAt: status.profileChangedAt?.toISOString() ?? null,
    pending: rerankPending(status, now),
  };
}

/** The order the browser last showed, kept per company in localStorage. */
export type SeenOrder = { weekOf: string; builtAt: string; keys: string[] };

export const seenStorageKey = (companyId: string) => `vsp:week-order:${companyId}`;

export function parseSeen(raw: string | null): SeenOrder | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<SeenOrder>;
    const ok =
      typeof value.weekOf === "string" &&
      typeof value.builtAt === "string" &&
      Array.isArray(value.keys) &&
      value.keys.every((k) => typeof k === "string");
    return ok ? { weekOf: value.weekOf!, builtAt: value.builtAt!, keys: value.keys! } : null;
  } catch {
    return null;
  }
}

/** The same week's cards, built again since they were last shown. A new week is not a re-rank. */
export function rebuiltSince(before: SeenOrder | null, now: SeenOrder): before is SeenOrder {
  return before !== null && before.weekOf === now.weekOf && before.builtAt !== now.builtAt;
}

/** The profile changed after the cards that were shown before were built. */
export function changedByProfile(profileChangedAt: string | null, shownBuiltAt: string): boolean {
  return profileChangedAt !== null && Date.parse(profileChangedAt) > Date.parse(shownBuiltAt);
}

export type OrderChange = { added: number; dropped: number; moved: number };

/** Length of the longest increasing run (not necessarily adjacent) in `values`. */
function longestIncreasing(values: number[]): number {
  const best = values.map(() => 1);
  for (let i = 0; i < values.length; i++) {
    for (let j = 0; j < i; j++) if (values[j] < values[i]) best[i] = Math.max(best[i], best[j] + 1);
  }
  return Math.max(0, ...best);
}

/**
 * New and dropped cards, and how many of the kept ones moved: the fewest that
 * have to move to turn the old order into the new one (one card jumping to the
 * top is one move, not five).
 */
export function orderChange(before: readonly string[], after: readonly string[]): OrderChange {
  const old = new Map(before.map((key, i) => [key, i]));
  const kept = after.filter((key) => old.has(key));
  return {
    added: after.length - kept.length,
    dropped: before.filter((key) => !after.includes(key)).length,
    moved: kept.length - longestIncreasing(kept.map((key) => old.get(key)!)),
  };
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "Re-ranked after your profile change: 1 new card, 1 dropped, 2 moved." */
export function changeLine(byProfile: boolean, { added, dropped, moved }: OrderChange): string {
  const head = byProfile ? "Re-ranked after your profile change" : "Your cards were re-ranked";
  const parts = [
    added ? count(added, "new card", "new cards") : null,
    dropped ? `${dropped} dropped` : null,
    moved ? `${moved} moved` : null,
  ].filter(Boolean);
  return `${head}: ${parts.length ? parts.join(", ") : "the same cards in the same order"}.`;
}

export type RowBox = { key: string; top: number; height: number };

/**
 * Where each card would sit in the old order, from the cards' current heights
 * (the old layout is gone after a reload). Cards that are new have no old place.
 */
export function previousTops(before: readonly string[], rows: readonly RowBox[], gap: number): Map<string, number> {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const tops = new Map<string, number>();
  let y = rows.length ? Math.min(...rows.map((r) => r.top)) : 0;
  for (const key of before) {
    const row = byKey.get(key);
    if (!row) continue;
    tops.set(key, y);
    y += row.height + gap;
  }
  return tops;
}
