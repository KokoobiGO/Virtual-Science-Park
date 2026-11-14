"use client";

import { cn } from "cn";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { isCurrentPath } from "@/lib/navigation";

export type NavMenuItem = { href: string; label: string };

/**
 * The site's main menu (C2). Render it as a sibling of the brand inside a
 * `flex flex-wrap` header row. From the md breakpoint up, `extra` (account,
 * sign out) sits at the end of that row and the links get a row of their own
 * below it, so any number of items fits. Below md a Menu button opens the links
 * and `extra` as a list. The current page is marked with aria-current="page".
 * `menuLabel` is the Menu button's text, in the reader's language (C19).
 */
export function NavMenu({
  items,
  label = "Main",
  menuLabel = "Menu",
  extra,
}: {
  items: NavMenuItem[];
  label?: string;
  menuLabel?: string;
  extra?: ReactNode;
}) {
  const pathname = usePathname();
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Open for one pathname only, so following a link closes the menu.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;

  // Escape closes the menu from the button or from inside it, and leaves focus on the button.
  const closeOnEscape = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape" || !open) return;
    setOpenOn(null);
    buttonRef.current?.focus();
  };

  return (
    <>
      <Button
        ref={buttonRef}
        variant="outline"
        size="sm"
        className="ml-auto md:hidden"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpenOn(open ? null : pathname)}
        onKeyDown={closeOnEscape}
      >
        {open ? <X aria-hidden /> : <Menu aria-hidden />}
        {menuLabel}
      </Button>
      <div
        id={panelId}
        className={cn("basis-full flex-col gap-3 pt-1 pb-3 md:contents", open ? "flex" : "hidden")}
        onKeyDown={closeOnEscape}
      >
        <nav aria-label={label} className="md:order-2 md:-ml-2.5 md:basis-full">
          <ul className="flex flex-col gap-0.5 md:flex-row md:flex-wrap md:items-center md:gap-1">
            {items.map((item) => {
              const current = isCurrentPath(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={current ? "page" : undefined}
                    className={cn(
                      "flex rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:px-2.5 md:py-1.5",
                      current && "bg-secondary font-semibold text-secondary-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        {extra ? (
          <div className="flex flex-wrap items-center gap-2 border-t pt-3 md:order-1 md:ml-auto md:border-0 md:pt-0">
            {extra}
          </div>
        ) : null}
      </div>
    </>
  );
}
