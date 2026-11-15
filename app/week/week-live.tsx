"use client";

import { ArrowDownUp, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useLocale } from "@/lib/i18n/client";
import {
  changedByProfile,
  changeLine,
  orderChange,
  parseSeen,
  pendingText,
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
  items: { key: string; card: ReactNode; /** An id for the card's row, so a link can jump to it. */ anchor?: string }[];
  /** Shown instead of the list when there are no cards. */
  empty?: ReactNode;
};

/** The re-rank move: a calm ease-out, each card a little after the one above it (capped, so a long list does not drag). */
const MOVE_MS = 650;
const MOVE_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const moveTransition = (index: number) => {
  const delay = Math.min(index, 8) * 30;
  return `transform ${MOVE_MS}ms ${MOVE_EASE} ${delay}ms, opacity ${MOVE_MS}ms ease ${delay}ms`;
};
/** Entrance: each card rises a little after the one above it (the first ten). */
const riseDelay = (index: number) => `${Math.min(index, 9) * 45}ms`;

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
  const locale = useLocale();
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

    const text = changeLine(changedByProfile(status.profileChangedAt, before.builtAt), orderChange(before.keys, shown.keys), locale);
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
        if (top === undefined) {
          // A new card: it fades in where it lands, slightly smaller at first.
          row.style.opacity = "0";
          row.style.transform = "scale(0.98)";
        } else {
          row.style.transform = `translateY(${top - row.offsetTop}px)`;
        }
      }
      list.getBoundingClientRect(); // apply the old places before the move starts
      rows.forEach((row, index) => {
        row.style.transition = moveTransition(index);
        row.style.transform = "";
        row.style.opacity = "";
        const done = (event: TransitionEvent) => {
          if (event.target !== row) return; // a button's own transition inside the card
          row.style.transition = "";
          row.removeEventListener("transitionend", done);
        };
        row.addEventListener("transitionend", done);
      });
    }
    // Not cancelled on cleanup: a second run in development finds nothing new and must not drop the line.
    requestAnimationFrame(() => setLine(text));
  }, [companyId, order, status.weekOf, status.builtAt, status.profileChangedAt, locale]);

  const message = pending ? pendingText(locale) : line;

  return (
    <div className="flex flex-col gap-4">
      <p
        role="status"
        className={message ? "flex items-start gap-2 text-sm text-muted-foreground" : "sr-only"}
      >
        {message ? (
          <span key={message} className="inline-flex animate-slide-down items-start gap-2">
            {pending ? (
              <LoaderCircle aria-hidden className="mt-0.5 size-4 shrink-0 animate-spin text-info motion-reduce:animate-none" />
            ) : (
              <ArrowDownUp aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
            )}
            <span>{message}</span>
          </span>
        ) : null}
      </p>
      {items.length ? (
        <ol ref={listRef} className="flex flex-col gap-4">
          {items.map((item, index) => (
            <li key={item.key} id={item.anchor} data-key={item.key} className="scroll-mt-24">
              {/* The entrance runs on this wrapper: the li carries the re-rank move and the card its hover lift. */}
              <div className="animate-rise" style={{ animationDelay: riseDelay(index) }}>
                {item.card}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        empty
      )}
    </div>
  );
}
