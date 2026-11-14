/**
 * Checks that source links still resolve (A20). Politely: a GET with a
 * browser-like User-Agent, only the status is read (the body is cancelled),
 * redirects are followed by hand so a private host is refused at every hop,
 * one retry for network errors and 5xx, and a cap on requests at once, both
 * overall and per host. Each distinct URL is requested once.
 */
import { publicHttpUrl, USER_AGENT } from "../fetcher/fetch-page";
import { classify, failureOf, type LinkOutcome, type Probe } from "./classify";

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export type LinkResult = {
  url: string;
  outcome: LinkOutcome;
  /** The last HTTP status, or null when no server answered. */
  status: number | null;
  reason: string;
  /** Where the link ended up, when the host or path differs from the start. */
  redirectedTo?: string;
};

export type CheckOptions = {
  /** Defaults to the global fetch. Tests pass a fake. */
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  maxConcurrent?: number;
  maxPerHost?: number;
  /** Pause before the one retry. */
  retryDelayMs?: number;
  /** Called after each link, e.g. for progress. */
  onResult?: (result: LinkResult) => void;
};

export const LINK_CHECK_DEFAULTS = {
  timeoutMs: 15_000,
  maxConcurrent: 6,
  maxPerHost: 2,
  retryDelayMs: 2_000,
};
export const MAX_REDIRECTS = 5;

const HEADERS = {
  "User-Agent": USER_AGENT,
  Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
  "Accept-Language": "sv,en;q=0.8",
};

type Settings = Required<Omit<CheckOptions, "onResult">>;

/** One result per distinct URL, in the order the URLs first appear. */
export async function checkLinks(urls: readonly string[], options: CheckOptions = {}): Promise<LinkResult[]> {
  const { onResult, ...rest } = options;
  const settings: Settings = {
    ...LINK_CHECK_DEFAULTS,
    fetchImpl: (url, init) => fetch(url, init),
    ...withoutUndefined(rest),
  };
  const unique = [...new Set(urls)];
  const results = new Map<string, LinkResult>();
  await runLimited(unique, hostOf, settings.maxConcurrent, settings.maxPerHost, async (url) => {
    const result = await checkOne(url, settings);
    results.set(url, result);
    onResult?.(result);
  });
  return unique.map((url) => results.get(url)!);
}

async function checkOne(input: string, settings: Settings): Promise<LinkResult> {
  let start: URL;
  try {
    start = safeUrl(input);
  } catch (error) {
    return { url: input, status: null, ...classify({ failure: "unsafe_url", detail: (error as Error).message }) };
  }

  let attempt = await request(start, settings);
  // The EU portal now and then redirects a good link to a data page that answers 404: ask once more.
  const redirected404 = "status" in attempt.probe && attempt.probe.status === 404 && attempt.finalUrl.href !== start.href;
  if (worthRetrying(attempt.probe) || redirected404) {
    await sleep(settings.retryDelayMs);
    attempt = await request(start, settings);
    attempt.probe.tries = 2;
  }

  const { probe, finalUrl } = attempt;
  const result: LinkResult = { url: input, status: "status" in probe ? probe.status : null, ...classify(probe) };
  if (movedTo(start, finalUrl)) {
    result.redirectedTo = finalUrl.href;
    // Some sites (vinnova.se) send a missing page to /404, which then answers 200.
    if (result.outcome === "ok" && NOT_FOUND_PATH.test(finalUrl.pathname)) {
      result.outcome = "broken";
      result.reason = `redirected to the site's not-found page (${finalUrl.pathname})`;
    }
  }
  return result;
}

/** A final path like /404, /404.html or /not-found: the site's own "page not found" page. */
const NOT_FOUND_PATH = /\/(404|not-found|page-not-found)(\.html?)?\/?$/i;

/** One try: follows up to MAX_REDIRECTS redirects, all within one time limit. */
async function request(start: URL, settings: Settings): Promise<{ probe: Probe; finalUrl: URL }> {
  let url = start;
  const signal = AbortSignal.timeout(settings.timeoutMs);
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const res = await settings.fetchImpl(url.href, { method: "GET", redirect: "manual", signal, headers: HEADERS });
      // Only the status matters: do not download the page.
      await res.body?.cancel().catch(() => undefined);

      const location = res.headers.get("location");
      if (res.status < 300 || res.status >= 400 || !location) return { probe: { status: res.status }, finalUrl: url };
      try {
        url = safeUrl(new URL(location, url).href);
      } catch (error) {
        return { probe: { failure: "unsafe_url", detail: `redirects to ${(error as Error).message}` }, finalUrl: url };
      }
    }
    return { probe: { failure: "redirects", detail: `more than ${MAX_REDIRECTS}` }, finalUrl: url };
  } catch (error) {
    if (signal.aborted) return { probe: { failure: "timeout", detail: `${settings.timeoutMs / 1000} s` }, finalUrl: url };
    return { probe: failureOf(error), finalUrl: url };
  }
}

/** A network error or a 5xx may pass; a 4xx, a TLS error or a refused address will not. */
function worthRetrying(probe: Probe): boolean {
  if ("status" in probe) return probe.status >= 500 && probe.status < 600;
  return probe.failure === "timeout" || probe.failure === "dns" || probe.failure === "refused" || probe.failure === "network";
}

/** Parses the URL and refuses anything but a public http(s) address, with a reason fit for the report. */
function safeUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("not a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(`not an http(s) address (${url.protocol})`);
  try {
    return publicHttpUrl(url.href);
  } catch {
    throw new Error(`a local or private address (${url.hostname})`);
  }
}

function movedTo(start: URL, end: URL): boolean {
  const path = (url: URL) => url.pathname.replace(/\/+$/, "");
  return start.host !== end.host || path(start) !== path(end);
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * Runs `work` on every item, at most `max` at once and at most `perKey` at
 * once for items with the same key. Items start in order, skipping those
 * whose key is busy.
 */
async function runLimited<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  max: number,
  perKey: number,
  work: (item: T) => Promise<void>,
): Promise<void> {
  const waiting = [...items];
  const busy = new Map<string, number>();
  let running = 0;
  await new Promise<void>((resolve, reject) => {
    const startMore = () => {
      if (!waiting.length && !running) return resolve();
      while (running < max) {
        const index = waiting.findIndex((item) => (busy.get(keyOf(item)) ?? 0) < perKey);
        if (index < 0) return;
        const [item] = waiting.splice(index, 1);
        const key = keyOf(item);
        running++;
        busy.set(key, (busy.get(key) ?? 0) + 1);
        work(item).then(() => {
          running--;
          busy.set(key, busy.get(key)! - 1);
          startMore();
        }, reject);
      }
    };
    startMore();
  });
}

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

function withoutUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}
