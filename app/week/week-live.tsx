"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  changedByProfile,
  changeLine,
  orderChange,
  parseSeen,
  PENDING_TEXT,
  POLL_IDLE_MS,
  POLL_PENDING_MS,
  previousTops,
  rebuiltSince,
  seenStorageKey,
  type SeenOrder,
  type WeekStatusJson,
} from "@/lib/week/live";

export type WeekLiveProps = {
  companyId: string;
  status: WeekStatusJson;
  /** The cards in their stored order, each with a key that survives a rebuild. */
  items: { key: string; card: ReactNode }[];
  /** Shown instead of the list when there are no cards. */
  empty?: ReactNode;
};

const MOVE = "transform 700ms cubic-bezier(0.2, 0, 0, 1), opacity 700ms ease";

function readSeen(companyId: string): SeenOrder | null {
  try {
    return parseSeen(window.localStorage.getItem(seenStorageKey(companyId)));
  } catch {
    return null; // storage blocked: no animation on reload, the page still works
  }
}

function writeSeen(companyId: string, seen: SeenOrder) {
  try {
    window.localStorage.setItem(seenStorageKey(companyId), JSON.stringify(seen));
  } catch {
    // storage blocked or full: only the next reload's animation is lost
  }
}

/**
 * The Your-week list (C8). It polls /api/week while the tab is visible and
 * loads the new cards when they were built again. Cards keep their keys across
 * a rebuild, so each one slides from its old place to its new one (a FLIP
 * move; none with prefers-reduced-motion), and a line says what changed. The
 * order last shown is kept in localStorage, so a reload after the change
 * moves the cards too.
 */
export function WeekLive({ companyId, status, items, empty }: WeekLiveProps) {
  const router = useRouter();
  const listRef = useRef<HTMLOListElement>(null);
  const seenRef = useRef<SeenOrder | null>(null);
  const [polled, setPolled] = useState<{ against: string | null; value: WeekStatusJson } | null>(null);
  const [line, setLine] = useState<string | null>(null);
  const order = items.map((item) => item.key).join("\n");
  // A poll answer counts only against the cards it was compared with.
  const pending = polled && polled.against === status.builtAt ? polled.value.pending : status.pending;

  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;

    const schedule = (ms: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(check, ms);
    };

    async function check() {
      // A hidden tab does not poll; coming back checks at once.
      if (stopped || document.visibilityState !== "visible") return;
      let next: WeekStatusJson | null = null;
      try {
        const response = await fetch("/api/week", { cache: "no-store" });
        if (response.status === 401 || response.status === 403) return; // signed out: stop
        if (response.ok) next = (await response.json()) as WeekStatusJson;
      } catch {
        // offline for a moment: try again later
      }
      if (stopped) return;
      if (next) {
        setPolled({ against: status.builtAt, value: next });
        if (next.builtAt !== status.builtAt || next.weekOf !== status.weekOf) router.refresh();
      }
      schedule((next ?? status).pending ? POLL_PENDING_MS : POLL_IDLE_MS);
    }

    const onVisibility = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisibility);
    schedule(status.pending ? POLL_PENDING_MS : POLL_IDLE_MS);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router, status]);

  useLayoutEffect(() => {
    const list = listRef.current;
    // offsetParent is null while the page is hidden (kept for back navigation): measure once it shows.
    if (!list || list.offsetParent === null || !status.weekOf || !status.builtAt) return;
    const shown: SeenOrder = { weekOf: status.weekOf, builtAt: status.builtAt, keys: order.split("\n") };
    const before = seenRef.current ?? readSeen(companyId);
    seenRef.current = shown;
    writeSeen(companyId, shown);
    if (!rebuiltSince(before, shown)) return;

    const text = changeLine(changedByProfile(status.profileChangedAt, before.builtAt), orderChange(before.keys, shown.keys));
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const rows = Array.from(list.children) as HTMLElement[];
      const gap = Number.parseFloat(getComputedStyle(list).rowGap) || 0;
      const from = previousTops(
        before.keys,
        rows.map((row) => ({ key: row.dataset.key ?? "", top: row.offsetTop, height: row.offsetHeight })),
        gap,
      );
      // First and Last are known: Invert each card to its old place, then Play the move to the new one.
      for (const row of rows) {
        const top = from.get(row.dataset.key ?? "");
        row.style.transition = "none";
        if (top === undefined) row.style.opacity = "0";
        else row.style.transform = `translateY(${top - row.offsetTop}px)`;
      }
      list.getBoundingClientRect(); // apply the old places before the move starts
      for (const row of rows) {
        row.style.transition = MOVE;
        row.style.transform = "";
        row.style.opacity = "";
        row.addEventListener(
          "transitionend",
          () => {
            row.style.transition = "";
          },
          { once: true },
        );
      }
    }
    // Not cancelled on cleanup: a second run in development finds nothing new and must not drop the line.
    requestAnimationFrame(() => setLine(text));
  }, [companyId, order, status.weekOf, status.builtAt, status.profileChangedAt]);

  return (
    <div className="flex flex-col gap-4">
      <p role="status" className={pending || line ? "text-sm font-medium text-foreground" : "sr-only"}>
        {pending ? PENDING_TEXT : (line ?? "")}
      </p>
      {items.length ? (
        <ol ref={listRef} className="flex flex-col gap-4">
          {items.map((item) => (
            <li key={item.key} data-key={item.key}>
              {item.card}
            </li>
          ))}
        </ol>
      ) : (
        empty
      )}
    </div>
  );
}
