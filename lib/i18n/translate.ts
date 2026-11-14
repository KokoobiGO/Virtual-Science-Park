/**
 * Looking up interface texts (C19). Pure, so the server helper, the client
 * hook and the tests share it.
 *
 * - Catalogues: messages/en.json and messages/sv.json, one top-level key per
 *   screen or shared piece (a "namespace"), nested keys below it.
 * - Keys are typed from the English catalogue: a key that is not there is a
 *   type error, and so is a Swedish catalogue that misses a key.
 * - `{name}` is replaced by `values.name`. A number goes in as it is; format
 *   it first with formatNumber() where the screen wants thousands separators.
 * - A plural is an object `{ "one": "...", "other": "..." }` (and optionally
 *   "zero"), picked with `values.count`. So no other group of keys may have a
 *   key named "other".
 * - `t.rich()` returns React nodes: `<link>chunk</link>` calls `values.link(chunk)`,
 *   and a `{name}` whose value is a React element is put in as it is.
 *
 * A key missing at runtime (only possible with a cast) falls back to English,
 * then to the key itself, so the page never breaks over one text.
 */
import { createElement, Fragment, type ReactNode } from "react";
import en from "@/messages/en.json";
import sv from "@/messages/sv.json";
import { DEFAULT_LOCALE, INTL_LOCALE, type Locale } from "./config";

export type Messages = typeof en;

/** Both catalogues. Typed as the English one, so a missing Swedish key fails the type check. */
export const MESSAGES: Record<Locale, Messages> = { en, sv };

export type Namespace = keyof Messages;

/** A plural entry: "other" is required, "one" and "zero" are optional. */
export type PluralForms = { zero?: string; one?: string; other: string };

/** Every dotted key path to a text (a string or a plural entry) below T. */
export type Paths<T> = {
  [K in keyof T & string]: T[K] extends string ? K : T[K] extends PluralForms ? K : `${K}.${Paths<T[K]>}`;
}[keyof T & string];

export type MessageKey<N extends Namespace> = Paths<Messages[N]>;

export type Values = Record<string, string | number>;
export type RichValues = Record<string, string | number | ReactNode | ((chunk: string) => ReactNode)>;

export type Translator<N extends Namespace> = {
  (key: MessageKey<N>, values?: Values): string;
  /** The same text with React nodes for `<tag>…</tag>` and `{name}` placeholders. */
  rich(key: MessageKey<N>, values: RichValues): ReactNode;
  readonly locale: Locale;
  readonly namespace: N;
};

function lookup(locale: Locale, path: string): string | PluralForms | undefined {
  let node: unknown = MESSAGES[locale];
  for (const part of path.split(".")) {
    if (!node || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  if (typeof node === "string") return node;
  if (node && typeof node === "object" && typeof (node as PluralForms).other === "string") return node as PluralForms;
  return undefined;
}

const numberFormats = new Map<Locale, Intl.NumberFormat>();
const pluralRules = new Map<Locale, Intl.PluralRules>();

/** A number as the language writes it. */
export function formatNumber(value: number, locale: Locale): string {
  let format = numberFormats.get(locale);
  if (!format) {
    format = new Intl.NumberFormat(INTL_LOCALE[locale], { maximumFractionDigits: 2 });
    numberFormats.set(locale, format);
  }
  return format.format(value);
}

/** The plural form for `count`: "zero" only when the entry has one, then the language's one/other rule. */
export function selectPlural(forms: PluralForms, count: number, locale: Locale): string {
  if (count === 0 && forms.zero !== undefined) return forms.zero;
  let rules = pluralRules.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(INTL_LOCALE[locale]);
    pluralRules.set(locale, rules);
  }
  return rules.select(count) === "one" && forms.one !== undefined ? forms.one : forms.other;
}

const PLACEHOLDER = /\{(\w+)\}/g;

/** Replace `{name}` with its value; a placeholder without a value stays as it is. */
export function interpolate(message: string, values: Values | undefined): string {
  if (!values) return message;
  return message.replace(PLACEHOLDER, (whole, name: string) => {
    const value = values[name];
    if (value === undefined) return whole;
    return String(value);
  });
}

/** The raw text for a key in a locale, with English and then the key as fallbacks, and the plural form picked. */
export function resolveMessage(locale: Locale, path: string, count?: unknown): string {
  const entry = lookup(locale, path) ?? (locale === DEFAULT_LOCALE ? undefined : lookup(DEFAULT_LOCALE, path));
  if (entry === undefined) return path;
  if (typeof entry === "string") return entry;
  return selectPlural(entry, typeof count === "number" ? count : Number.NaN, locale);
}

const RICH_TOKEN = /<(\w+)>([\s\S]*?)<\/\1>|\{(\w+)\}/g;

/** The rich form: tags call their function, React elements go in as nodes. */
export function richText(message: string, values: RichValues): ReactNode {
  const plain: Values = {};
  for (const [name, value] of Object.entries(values)) if (typeof value === "string" || typeof value === "number") plain[name] = value;

  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of message.matchAll(RICH_TOKEN)) {
    const at = match.index ?? 0;
    if (at > last) parts.push(interpolate(message.slice(last, at), plain));
    last = at + match[0].length;
    const [whole, tag, chunk, name] = match;
    if (tag !== undefined) {
      const render = values[tag];
      const inner = interpolate(chunk, plain);
      parts.push(typeof render === "function" ? render(inner) : inner);
    } else {
      const value = values[name];
      if (value === undefined || typeof value === "function") parts.push(whole);
      else if (typeof value === "number") parts.push(String(value));
      else parts.push(value as ReactNode);
    }
  }
  if (last < message.length) parts.push(interpolate(message.slice(last), plain));
  // Keyed, so React does not warn about a list of elements.
  return parts.map((part, i) => createElement(Fragment, { key: i }, part));
}

/** A translator for one namespace in one locale. */
export function createTranslator<N extends Namespace>(locale: Locale, namespace: N): Translator<N> {
  const t = (key: string, values?: Values) => interpolate(resolveMessage(locale, `${namespace}.${key}`, values?.count), values);
  return Object.assign(t, {
    rich: (key: string, values: RichValues) => richText(resolveMessage(locale, `${namespace}.${key}`, values.count), values),
    locale,
    namespace,
  }) as Translator<N>;
}

/** Every leaf key path of a catalogue, plural forms included ("evidence.quotes.one"). For the catalogue tests. */
export function leafPaths(node: unknown, prefix = ""): string[] {
  if (typeof node === "string") return [prefix];
  if (!node || typeof node !== "object") return [`${prefix} (not a string)`];
  return Object.entries(node).flatMap(([key, child]) => leafPaths(child, prefix ? `${prefix}.${key}` : key));
}
