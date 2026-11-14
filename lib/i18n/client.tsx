"use client";

/**
 * The reader's language in client components (C19).
 *
 * A server component that knows the locale (from getLocale(), inside its
 * Suspense boundary) wraps its client components in <LocaleProvider>, so the
 * server and the browser render the same words. Without a provider (an
 * error.tsx, which Next renders on its own) the hook reads the cookie in the
 * browser and English on the server.
 */
import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { DEFAULT_LOCALE, localeFromCookieString, type Locale } from "./config";
import { createTranslator, type Namespace, type Translator } from "./translate";

const LocaleContext = createContext<Locale | null>(null);

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext value={locale}>{children}</LocaleContext>;
}

/** Sent by the language switch after the cookie changed, so the fallback reads it again. */
export const LOCALE_CHANGED_EVENT = "vsp:locale";

function subscribe(onChange: () => void) {
  window.addEventListener(LOCALE_CHANGED_EVENT, onChange);
  return () => window.removeEventListener(LOCALE_CHANGED_EVENT, onChange);
}

const cookieLocale = () => localeFromCookieString(document.cookie);
const noLocale = () => null;

export function useLocale(): Locale {
  const fromProvider = useContext(LocaleContext);
  const fromCookie = useSyncExternalStore(subscribe, cookieLocale, noLocale);
  return fromProvider ?? fromCookie ?? DEFAULT_LOCALE;
}

/** The texts of one namespace in the reader's language. */
export function useT<N extends Namespace>(namespace: N): Translator<N> {
  const locale = useLocale();
  return useMemo(() => createTranslator(locale, namespace), [locale, namespace]);
}
