"use client";

import { useEffect } from "react";

/**
 * Lets every card on every page catch the pointer's light: on pointer move it
 * gives each card on screen --mx/--my (the pointer, relative to that card).
 * globals.css draws the glow from those. One listener for the whole app,
 * at most once a frame; nothing when the reader asks for reduced motion.
 */
export function PointerGlow() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    let x = 0;
    let y = 0;
    const paint = () => {
      frame = 0;
      for (const card of document.querySelectorAll<HTMLElement>('[data-slot="card"], [data-glow]')) {
        const box = card.getBoundingClientRect();
        if (box.bottom < -200 || box.top > window.innerHeight + 200) continue;
        card.style.setProperty("--mx", `${x - box.left}px`);
        card.style.setProperty("--my", `${y - box.top}px`);
      }
    };
    const move = (event: PointerEvent) => {
      x = event.clientX;
      y = event.clientY;
      if (!frame) frame = requestAnimationFrame(paint);
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => {
      window.removeEventListener("pointermove", move);
      cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}
