"use client";

import { cn } from "cn";
import { Fragment, useLayoutEffect } from "react";
import { setLocale } from "@/app/actions/locale";
import { Button } from "@/components/ui/button";
import { LOCALE_CHANGED_EVENT } from "@/lib/i18n/client";
import { LOCALE_NAMES, LOCALES, type Locale } from "@/lib/i18n/config";

/**
 * The language switch in the header (C19): "English / Svenska". Each name is a
 * submit button of one small form, so it works with the keyboard and without
 * JavaScript; the server action stores the cookie and draws the page again.
 * The current language is pressed. Each name is in its own language (`lang`),
 * so a screen reader says it right.
 */
export function LanguageSwitch({ locale, label }: { locale: Locale; label: string }) {
  // <html lang> follows the choice: the inline script in app/layout.tsx sets it
  // on a full load, this keeps it right after a switch (and after React's dev remount).
  useLayoutEffect(() => {
    document.documentElement.lang = locale;
    window.dispatchEvent(new Event(LOCALE_CHANGED_EVENT));
  }, [locale]);

  return (
    <form action={setLocale}>
      <div role="group" aria-label={label} className="flex items-center text-muted-foreground">
        {LOCALES.map((option, i) => (
          <Fragment key={option}>
            {i > 0 ? (
              <span aria-hidden className="px-0.5 text-xs">
                /
              </span>
            ) : null}
            <Button
              type="submit"
              name="locale"
              value={option}
              lang={option}
              variant="ghost"
              size="sm"
              aria-pressed={option === locale}
              className={cn("px-1.5", option === locale && "font-semibold text-foreground underline underline-offset-4")}
            >
              {LOCALE_NAMES[option]}
            </Button>
          </Fragment>
        ))}
      </div>
    </form>
  );
}
