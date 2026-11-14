/**
 * The reader's language on the server (C19).
 *
 * Reading the cookie is request-time data: with Cache Components, call these
 * only from components inside a <Suspense> boundary (as with getViewer() in
 * lib/auth.ts), from server actions or from generateMetadata of a page that
 * has request-time content anyway. The rest of a page stays in the static shell.
 */
import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { LOCALE_COOKIE, parseLocale, type Locale } from "./config";
import { createTranslator, type Namespace, type Translator } from "./translate";

/** The locale from the cookie; English without one. One read per request. */
export const getLocale = cache(async (): Promise<Locale> => parseLocale((await cookies()).get(LOCALE_COOKIE)?.value));

/** The texts of one namespace in the reader's language. */
export async function getT<N extends Namespace>(namespace: N): Promise<Translator<N>> {
  return createTranslator(await getLocale(), namespace);
}
