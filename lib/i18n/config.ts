/**
 * The interface languages (C19). English is the default and stays the
 * default: no cookie, or a cookie with an unknown value, means English.
 *
 * The choice lives in one cookie, not in the URL, so routes, the proxy's path
 * rules and the e2e suite stay as they are. Pure: no server or client imports,
 * so both sides and the tests can use it.
 */
export const LOCALES = ["en", "sv"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** Read by the server (lib/i18n/server.ts), the inline script in app/layout.tsx and the client fallback. Not httpOnly: it is not secret. */
export const LOCALE_COOKIE = "vsp_locale";

/** One year: the choice should outlive sessions, sign-in and sign-out. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Each language in its own words, for the switch. */
export const LOCALE_NAMES: Record<Locale, string> = { en: "English", sv: "Svenska" };

/** The locale Intl formats dates and numbers with. en-GB keeps "14 Nov 2026", as the screens print it today. */
export const INTL_LOCALE: Record<Locale, string> = { en: "en-GB", sv: "sv-SE" };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** A cookie or form value as a locale; anything else is the default. */
export function parseLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** The locale in a `document.cookie` string, or null when the cookie is not set. */
export function localeFromCookieString(cookies: string): Locale | null {
  const match = cookies.match(new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]*)`));
  if (!match) return null;
  return parseLocale(decodeURIComponent(match[1]));
}

/**
 * The inline script for <head>: sets <html lang> from the cookie before the
 * first paint, so the static shell (prerendered in English) carries the
 * reader's language. Only "sv" changes anything.
 */
export const HTML_LANG_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|;\\s*)${LOCALE_COOKIE}=([^;]*)/);if(m&&m[1]==="sv")document.documentElement.lang="sv"}catch(e){}})()`;
