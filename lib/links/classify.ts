/**
 * The verdict on one source link (A20), from what the server answered or how
 * the request failed. Pure: no network, so every case is unit-tested.
 *
 * - ok: a 2xx answer, after following redirects.
 * - broken: the page is gone or the site cannot be reached: 404 or 410, a DNS
 *   failure, a refused connection, a TLS error, a 5xx on both tries, or an
 *   address we will not request.
 * - blocked: the site would not tell a script (401, 403, 429, a timeout or
 *   another answer we cannot read), so a person must check it in a browser.
 */

export type LinkOutcome = "ok" | "broken" | "blocked";

/** How a request ended without an HTTP answer we can use. */
export type FailureKind =
  /** No answer within the time limit. */
  | "timeout"
  /** The host name does not exist. */
  | "dns"
  /** The server refused the connection. */
  | "refused"
  /** The certificate or the TLS handshake failed. */
  | "tls"
  /** Any other network failure, e.g. a dropped connection. */
  | "network"
  /** More redirects than we follow. */
  | "redirects"
  /** Not a public http(s) address (or a redirect to one), so it was never requested. */
  | "unsafe_url";

/** One finished request: an HTTP status, or the way it failed. `tries` counts the requests made. */
export type Probe = { status: number; tries?: number } | { failure: FailureKind; detail?: string; tries?: number };

export type Verdict = { outcome: LinkOutcome; reason: string };

export function classify(probe: Probe): Verdict {
  if ("status" in probe) return classifyStatus(probe.status, probe.tries ?? 1);
  const detail = probe.detail ? `: ${probe.detail}` : "";
  switch (probe.failure) {
    case "timeout":
      // The detail is the time limit, e.g. "15 s".
      return { outcome: "blocked", reason: `no answer in ${probe.detail ?? "time"}` };
    case "dns":
      return { outcome: "broken", reason: `the host name does not exist (DNS)${detail}` };
    case "refused":
      return { outcome: "broken", reason: `the server refused the connection${detail}` };
    case "tls":
      return { outcome: "broken", reason: `TLS error${detail}` };
    case "network":
      return { outcome: "blocked", reason: `the connection failed${detail}; check by hand` };
    case "redirects":
      return { outcome: "blocked", reason: `too many redirects (a loop, or the site needs cookies)${detail}` };
    case "unsafe_url":
      return { outcome: "broken", reason: `not requested${detail}` };
  }
}

function classifyStatus(status: number, tries: number): Verdict {
  if (status >= 200 && status < 300) return { outcome: "ok", reason: `answered ${status}` };
  if (status === 404) return { outcome: "broken", reason: "page not found (404)" };
  if (status === 410) return { outcome: "broken", reason: "page removed (410)" };
  if (status === 401) return { outcome: "blocked", reason: "asks for a login (401)" };
  if (status === 403) return { outcome: "blocked", reason: "refused to answer a script (403)" };
  if (status === 429) return { outcome: "blocked", reason: "too many requests (429): the site limits scripts" };
  if (status >= 500 && status < 600) {
    return { outcome: "broken", reason: `server error ${status}${tries > 1 ? ", also on a second try" : ""}` };
  }
  return { outcome: "blocked", reason: `unexpected answer ${status}; check by hand` };
}

const TIMEOUT_CODES = new Set(["ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT"]);
const TLS_CODE = /^(CERT_|ERR_TLS_|ERR_SSL_|UNABLE_TO_|DEPTH_ZERO_SELF_SIGNED|SELF_SIGNED_CERT|EPROTO$)/;

type ErrorLike = { name?: string; code?: string; message?: string; cause?: unknown; errors?: ErrorLike[] };

/**
 * What kind of failure a thrown fetch error is. Node's fetch throws
 * "fetch failed" and puts the real error (with a `code`) in `cause`; a
 * connection to a host with several addresses fails with an AggregateError.
 */
export function failureOf(error: unknown): { failure: FailureKind; detail?: string } {
  const outer = (error ?? {}) as ErrorLike;
  if (outer.name === "TimeoutError" || outer.name === "AbortError") return { failure: "timeout" };

  const inner = (outer.cause ?? outer) as ErrorLike;
  const code = inner.code ?? inner.errors?.[0]?.code;
  const message = inner.message || inner.errors?.[0]?.message || outer.message || String(error);

  if (code === "ENOTFOUND") return { failure: "dns" };
  if (code === "ECONNREFUSED") return { failure: "refused" };
  if (code && TIMEOUT_CODES.has(code)) return { failure: "timeout" };
  if (code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE") {
    // Node does not fetch a missing intermediate certificate; browsers often do.
    return { failure: "tls", detail: `${message} (the server may be missing an intermediate certificate; a browser may still open it)` };
  }
  if (code && TLS_CODE.test(code)) return { failure: "tls", detail: message };
  return { failure: "network", detail: code && !message.includes(code) ? `${code} ${message}` : message };
}
