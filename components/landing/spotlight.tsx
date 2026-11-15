"use client";

import { cn } from "cn";
import type { PointerEvent, ReactNode } from "react";

/**
 * Cards inside follow the pointer with a soft glow on their border and face.
 * Each [data-spot] child gets --mx/--my relative to itself, so neighbouring
 * cards catch the light too. Decorative only; nothing depends on it.
 */
export function Spotlight({ children, className }: { children: ReactNode; className?: string }) {
  const move = (event: PointerEvent<HTMLElement>) => {
    for (const card of event.currentTarget.querySelectorAll<HTMLElement>("[data-spot]")) {
      const box = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${event.clientX - box.left}px`);
      card.style.setProperty("--my", `${event.clientY - box.top}px`);
    }
  };
  return (
    <div onPointerMove={move} className={cn("group/spot", className)}>
      {children}
    </div>
  );
}

/** One glowing card: a 1px lit border around a dark face. */
export function SpotCard({ children, className, innerClassName }: { children: ReactNode; className?: string; innerClassName?: string }) {
  return (
    <div
      data-spot
      className={cn(
        "relative rounded-2xl bg-white/[0.08] p-px [--mx:-999px] [--my:-999px]",
        "bg-[radial-gradient(260px_circle_at_var(--mx)_var(--my),oklch(0.82_0.12_215/0.75),transparent_70%),linear-gradient(oklch(1_0_0/0.08),oklch(1_0_0/0.08))]",
        className,
      )}
    >
      <div
        className={cn(
          "relative h-full rounded-[calc(1rem-1px)] bg-[oklch(0.16_0.006_280)] bg-[radial-gradient(420px_circle_at_var(--mx)_var(--my),oklch(0.75_0.12_230/0.1),transparent_45%)]",
          innerClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
