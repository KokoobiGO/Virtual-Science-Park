"use client";

import { cn } from "cn";
import { ChevronDown } from "lucide-react";
import { Children, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { FIRST_ROWS } from "./list-size";

/** Hides every row after the first FIRST_ROWS (a static class, so Tailwind finds it). */
const HIDE_REST = "[&>li:nth-child(n+21)]:hidden";

/**
 * A long list that shows its first rows and a "Show all" button. Every row
 * stays in the page (hidden, not left out), so find-in-page after opening,
 * the map's "Show it in the list" link and the browser tests still reach any
 * row: a row named in the address (:target) shows even while the rest are
 * folded away (`target:flex!` on the row).
 */
export function ShowMoreList({
  children,
  className,
  showAllLabel,
  showingLabel,
}: {
  children: ReactNode;
  className?: string;
  /** "Show all 190", in the reader's language. */
  showAllLabel: string;
  /** "Showing the first 20.", in the reader's language. */
  showingLabel: string;
}) {
  const [all, setAll] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const count = Children.count(children);
  const folded = !all && count > FIRST_ROWS;

  const showAll = () => {
    setAll(true);
    // Move focus to the first newly shown row's link, so keyboard readers continue where the list went on.
    requestAnimationFrame(() => listRef.current?.children[FIRST_ROWS]?.querySelector<HTMLElement>("a, button")?.focus());
  };

  return (
    <>
      <ul ref={listRef} className={cn(className, folded && HIDE_REST)}>
        {children}
      </ul>
      {folded ? (
        <div className="flex flex-col items-center gap-2 pt-2">
          <p className="text-xs text-muted-foreground">{showingLabel}</p>
          <Button variant="outline" size="sm" className="press rounded-full px-4" onClick={showAll}>
            <ChevronDown aria-hidden />
            {showAllLabel}
          </Button>
        </div>
      ) : null}
    </>
  );
}
