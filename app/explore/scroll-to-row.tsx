"use client";

import { useEffect } from "react";

/**
 * Brings the row named in the address (#opportunity-…) into view and flashes it
 * once. The list streams in after the page, so the browser's own jump to the
 * anchor finds nothing; this runs once the rows are there. The row keeps its
 * :target colour afterwards. Readers who ask for reduced motion get the jump
 * without the flash.
 */
export function ScrollToRow() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id.startsWith("opportunity-")) return;
    const row = document.getElementById(id);
    if (!row) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    row.scrollIntoView({ block: "center", behavior: "auto" });
    if (reduce) return;
    row.animate(
      [
        { boxShadow: "0 0 0 6px color-mix(in oklab, var(--primary) 40%, transparent)", backgroundColor: "color-mix(in oklab, var(--primary) 18%, var(--card))" },
        { boxShadow: "0 0 0 0 transparent" },
      ],
      { duration: 1600, delay: 250, easing: "ease-out", fill: "backwards" },
    );
  }, []);
  return null;
}
