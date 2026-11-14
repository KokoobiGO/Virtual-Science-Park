/**
 * Downloads one public web page as HTML text (A1). Pages come from member
 * sites we do not control, so: http(s) only, no private or local hosts (also
 * after a redirect), a time limit and a size limit.
 */

const TIMEOUT_MS = 15_000;
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 5;
export const USER_AGENT = "Mozilla/5.0 (compatible; snapshot-fetcher/0.1)";

export class FetchPageError extends Error {
  constructor(
    message: string,
    /** The HTTP status, when the server answered. */
    readonly status?: number,
  ) {
    super(message);
  }

  /** True when trying again cannot help: a bad URL, a 4xx answer or a page that is not HTML. */
  get permanent(): boolean {
    return this.status === undefined || (this.status >= 400 && this.status < 500 && this.status !== 429);
  }
}

/** Parses the URL and refuses anything that is not a public http(s) address. */
export function publicHttpUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new FetchPageError(`Not a URL: ${input}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new FetchPageError(`Only http and https pages can be fetched: ${input}`);
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const local =
    host === "localhost" ||
    /\.(localhost|local|internal|test)$/.test(host) ||
    /^(0|10|127)\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === "::1" ||
    /^f[cd][0-9a-f]{2}:/.test(host) ||
    /^fe80:/.test(host);
  if (local) throw new FetchPageError(`Local and private addresses cannot be fetched: ${input}`);
  return url;
}

/** Bytes to text. The charset comes from the header, then a <meta> tag, then UTF-8. */
export function decodeHtml(bytes: Uint8Array, contentType: string | null): string {
  const fromHeader = contentType?.match(/charset=["']?([\w-]+)/i)?.[1];
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 2048));
  const charset = fromHeader ?? head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ?? "utf-8";
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

export type FetchedPage = {
  /** The address after redirects. */
  url: string;
  status: number;
  html: string;
};

export async function fetchPage(input: string): Promise<FetchedPage> {
  let url = publicHttpUrl(input);
  const signal = AbortSignal.timeout(TIMEOUT_MS);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res: Response;
    try {
      res = await fetch(url, {
        signal,
        redirect: "manual",
        headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml", "Accept-Language": "sv,en;q=0.8" },
      });
    } catch (error) {
      const reason = signal.aborted ? `no answer in ${TIMEOUT_MS / 1000} s` : ((error as Error).cause as Error)?.message || (error as Error).message;
      // A network failure may pass, so it is not permanent: give it a 5xx-like status.
      throw new FetchPageError(`Could not reach ${url.host}: ${reason}`, 503);
    }

    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      url = publicHttpUrl(new URL(location, url).href);
      continue;
    }
    if (!res.ok) throw new FetchPageError(`${url.href} answered ${res.status}`, res.status);

    const contentType = res.headers.get("content-type");
    if (contentType && !/html|text\/plain/i.test(contentType)) {
      throw new FetchPageError(`${url.href} is not a web page (${contentType})`);
    }
    if (Number(res.headers.get("content-length")) > MAX_BYTES) {
      throw new FetchPageError(`${url.href} is larger than ${MAX_BYTES / 1024 / 1024} MB`);
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > MAX_BYTES) throw new FetchPageError(`${url.href} is larger than ${MAX_BYTES / 1024 / 1024} MB`);
    return { url: url.href, status: res.status, html: decodeHtml(bytes, contentType) };
  }
  throw new FetchPageError(`${input} redirected more than ${MAX_REDIRECTS} times`);
}
