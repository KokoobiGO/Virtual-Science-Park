/**
 * Downloads one public web page as HTML text (A1). Pages come from member
 * sites we do not control, so: http(s) only, no private or local addresses
 * (also after a redirect), a time limit and a size limit.
 *
 * The address check looks at the address, not only at the name
 * (docs/security-review.md, F3): an IP literal is judged in every form
 * (IPv4-mapped IPv6 included), a host name is resolved and refused when any
 * of its addresses is private, and the request then connects to exactly the
 * addresses that were checked, so a second DNS answer (rebinding) cannot move
 * it. Every redirect hop is checked the same way.
 */
import type { LookupAddress } from "node:dns";
import { lookup as dnsLookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { pipeline, type Readable } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";

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

/** Addresses no fetch may reach: this host, private, shared, loopback, link-local, test, multicast and reserved ranges. */
const BLOCKED = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], // "this network": 0.0.0.0 reaches the server itself
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // shared address space (carrier-grade NAT, inside cloud networks)
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // link-local, with the cloud metadata address
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3], // multicast, reserved and broadcast
] as const) {
  BLOCKED.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 96], // unspecified (::), loopback (::1) and the old IPv4-compatible form
  ["64:ff9b:1::", 48], // local-use NAT64
  ["100::", 64], // discard-only
  ["2001:db8::", 32], // documentation
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["fec0::", 10], // old site-local
  ["ff00::", 8], // multicast
] as const) {
  BLOCKED.addSubnet(network, prefix, "ipv6");
}

/** The eight 16-bit groups of an IPv6 address (a dotted IPv4 tail included), or null. */
function ipv6Groups(ip: string): number[] | null {
  let text = ip.toLowerCase();
  const tail = text.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (tail) {
    const [a, b, c, d] = tail[2].split(".").map(Number);
    text = `${tail[1]}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const groups = (half: string) => (half ? half.split(":").map((g) => parseInt(g, 16)) : []);
  const head = groups(halves[0]);
  const rest = halves.length === 2 ? groups(halves[1]) : [];
  const zeros = halves.length === 2 ? Math.max(0, 8 - head.length - rest.length) : 0;
  const all = [...head, ...new Array<number>(zeros).fill(0), ...rest];
  return all.length === 8 && all.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? all : null;
}

/**
 * True when no fetch may reach this address. IPv4-mapped (::ffff:a.b.c.d) and
 * NAT64 (64:ff9b::a.b.c.d) addresses are judged by the IPv4 address inside.
 * Anything that is not an IP address counts as blocked.
 */
export function isBlockedAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, "").replace(/%.*$/, "");
  const family = isIP(ip);
  if (family === 4) return BLOCKED.check(ip, "ipv4");
  if (family !== 6) return true;
  const g = ipv6Groups(ip);
  if (!g) return true;
  const mapped = g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff;
  const nat64 = g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0);
  if (mapped || nat64) return isBlockedAddress([g[6] >> 8, g[6] & 0xff, g[7] >> 8, g[7] & 0xff].join("."));
  return BLOCKED.check(g.map((x) => x.toString(16)).join(":"), "ipv6");
}

/**
 * Parses the URL and refuses anything that is not an http(s) address with a
 * public host: local names, and IP literals in a blocked range. A host name
 * is only judged by its text here; resolvePublicUrl() also checks where it
 * points, and fetchPage() uses that.
 */
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
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  const local =
    host === "localhost" ||
    /\.(localhost|local|internal|test)$/.test(host) ||
    (isIP(host) !== 0 && isBlockedAddress(host));
  if (local) throw new FetchPageError(`Local and private addresses cannot be fetched: ${input}`);
  return url;
}

/** How a host name becomes addresses; tests pass their own. */
export type HostLookup = (host: string) => Promise<LookupAddress[]>;

const systemLookup: HostLookup = (host) => dnsLookup(host, { all: true });

/**
 * publicHttpUrl(), then the addresses the host resolves to. Refused when any
 * of them is local or private: a public name can point anywhere.
 */
export async function resolvePublicUrl(input: string, lookup: HostLookup = systemLookup): Promise<{ url: URL; addresses: LookupAddress[] }> {
  const url = publicHttpUrl(input);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const family = isIP(host);
  if (family) return { url, addresses: [{ address: host, family }] };

  let addresses: LookupAddress[];
  try {
    addresses = await lookup(host);
  } catch (error) {
    // A name that does not resolve now may resolve later, so not permanent.
    throw new FetchPageError(`Could not reach ${url.host}: ${(error as Error).message}`, 503);
  }
  if (!addresses.length) throw new FetchPageError(`Could not reach ${url.host}: the name has no address`, 503);
  const blocked = addresses.find((a) => isBlockedAddress(a.address));
  if (blocked) throw new FetchPageError(`Local and private addresses cannot be fetched: ${input} (${host} points at ${blocked.address})`);
  return { url, addresses };
}

/** A socket `lookup` that answers only with the addresses already checked. */
function pinnedLookup(addresses: LookupAddress[]): LookupFunction {
  return (host, options, callback) => {
    const family = options.family === 4 || options.family === "IPv4" ? 4 : options.family === 6 || options.family === "IPv6" ? 6 : 0;
    const usable = family ? addresses.filter((a) => a.family === family) : addresses;
    if (!usable.length) {
      callback(Object.assign(new Error(`no checked address for ${host}`), { code: "ENOTFOUND" }), "");
    } else if (options.all) {
      callback(null, usable);
    } else {
      callback(null, usable[0].address, usable[0].family);
    }
  };
}

/** One GET to exactly these addresses. Redirects are not followed here. */
function get(url: URL, addresses: LookupAddress[], signal: AbortSignal): Promise<http.IncomingMessage> {
  const options: https.RequestOptions = {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "sv,en;q=0.8",
      "Accept-Encoding": "gzip, deflate, br",
    },
    lookup: pinnedLookup(addresses),
    // A fresh connection each time, so no pooled socket skips the lookup above.
    agent: false,
    signal,
  };
  return new Promise((resolve, reject) => {
    const req = url.protocol === "https:" ? https.request(url, options, resolve) : http.request(url, options, resolve);
    req.on("error", reject);
    req.end();
  });
}

/** The body, decompressed, refused once it passes MAX_BYTES. */
async function readBody(res: http.IncomingMessage, label: string): Promise<Uint8Array> {
  const encoding = String(res.headers["content-encoding"] ?? "").trim().toLowerCase();
  const decoder =
    encoding === "gzip" || encoding === "x-gzip" ? createGunzip() : encoding === "deflate" ? createInflate() : encoding === "br" ? createBrotliDecompress() : null;
  const stream: Readable = decoder ? pipeline(res, decoder, () => {}) : res;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    size += (chunk as Buffer).length;
    if (size > MAX_BYTES) {
      res.destroy();
      throw new FetchPageError(`${label} is larger than ${MAX_BYTES / 1024 / 1024} MB`);
    }
    chunks.push(chunk as Buffer);
  }
  return new Uint8Array(Buffer.concat(chunks));
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
  let { url, addresses } = await resolvePublicUrl(input);
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  // A network failure may pass, so it is not permanent: give it a 5xx-like status.
  const unreachable = (error: unknown) =>
    new FetchPageError(`Could not reach ${url.host}: ${signal.aborted ? `no answer in ${TIMEOUT_MS / 1000} s` : (error as Error).message}`, 503);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res: http.IncomingMessage;
    try {
      res = await get(url, addresses, signal);
    } catch (error) {
      throw unreachable(error);
    }

    const status = res.statusCode ?? 0;
    const location = res.headers.location;
    if (status >= 300 && status < 400 && location) {
      res.destroy();
      ({ url, addresses } = await resolvePublicUrl(new URL(location, url).href));
      continue;
    }
    if (status < 200 || status >= 300) {
      res.destroy();
      throw new FetchPageError(`${url.href} answered ${status}`, status);
    }

    const contentType = res.headers["content-type"] ?? null;
    if (contentType && !/html|text\/plain/i.test(contentType)) {
      res.destroy();
      throw new FetchPageError(`${url.href} is not a web page (${contentType})`);
    }
    if (Number(res.headers["content-length"]) > MAX_BYTES) {
      res.destroy();
      throw new FetchPageError(`${url.href} is larger than ${MAX_BYTES / 1024 / 1024} MB`);
    }
    let bytes: Uint8Array;
    try {
      bytes = await readBody(res, url.href);
    } catch (error) {
      if (error instanceof FetchPageError) throw error;
      throw unreachable(error);
    }
    return { url: url.href, status, html: decodeHtml(bytes, contentType) };
  }
  throw new FetchPageError(`${input} redirected more than ${MAX_REDIRECTS} times`);
}
