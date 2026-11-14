"use client";

import { useRef, useState, type ReactNode } from "react";
import { MousePointerClick } from "lucide-react";
import { useT } from "@/lib/i18n/client";

/** One pin, placed in percent of the map's width and height. */
export type PickerPin = { id: string; title: string; town: string; verified: boolean; left: number; top: number };

const CARD_ID = "testbed-map-card";

/**
 * The pins over the drawn map, and the selected facility's card beside it (or
 * below it on a phone). Each pin is a real button named after the facility, so
 * it can be reached with the keyboard and read by a screen reader. The cards
 * are rendered on the server and only shown here. Its own words come from
 * the page's <LocaleProvider> (C19).
 */
export function TestbedMapPicker({
  label,
  drawing,
  pins,
  cards,
}: {
  /** The accessible name of the map. */
  label: string;
  /** The SVG sketch under the pins. */
  drawing: ReactNode;
  pins: PickerPin[];
  cards: Record<string, ReactNode>;
}) {
  const t = useT("explore");
  const [selected, setSelected] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  // A filter change can take the selected facility away.
  const card = selected && Object.hasOwn(cards, selected) ? cards[selected] : null;

  function select(id: string) {
    setSelected(id);
    // On a phone the card sits below the map: bring it into view, without moving the focus off the pin.
    requestAnimationFrame(() => {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      panel.current?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
    });
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <div role="group" aria-label={label} className="relative overflow-hidden rounded-xl border bg-info-soft">
        {drawing}
        {pins.map((pin) => {
          const current = pin.id === selected;
          return (
            <button
              key={pin.id}
              type="button"
              aria-label={pin.title}
              aria-pressed={current}
              aria-controls={CARD_ID}
              title={t(pin.verified ? "map.pinTitle" : "map.pinTitleNotVerified", { title: pin.title, town: pin.town })}
              onClick={() => select(pin.id)}
              className="group absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
              style={{ left: `${pin.left}%`, top: `${pin.top}%` }}
            >
              <span
                aria-hidden
                className={`block rounded-full border-2 border-primary shadow-sm transition-[width,height] duration-200 group-hover:size-5 group-focus-visible:size-5 group-focus-visible:ring-2 group-focus-visible:ring-ring ${
                  pin.verified ? "bg-primary" : "bg-background"
                } ${current ? "size-5 ring-2 ring-ring ring-offset-2 ring-offset-background" : "size-4"}`}
              />
            </button>
          );
        })}
      </div>
      <div ref={panel} id={CARD_ID} aria-live="polite" className="scroll-mt-24">
        {/* Keyed by the pin, so each new choice slides in. */}
        <div key={card ? selected : "hint"} className="animate-slide-down">
          {card ?? (
            <p className="flex items-center gap-2 rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
              <MousePointerClick aria-hidden className="size-4 shrink-0" />
              {t("map.pickHint")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
