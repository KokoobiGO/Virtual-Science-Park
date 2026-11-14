import { describe, expect, it } from "vitest";
import { classify, failureOf, type Probe } from "./classify";

describe("classify", () => {
  it.each<[Probe, string, RegExp]>([
    [{ status: 200 }, "ok", /answered 200/],
    [{ status: 204 }, "ok", /answered 204/],
    [{ status: 404 }, "broken", /not found \(404\)/],
    [{ status: 410 }, "broken", /removed \(410\)/],
    [{ status: 503, tries: 2 }, "broken", /server error 503, also on a second try/],
    [{ status: 500 }, "broken", /^server error 500$/],
    [{ status: 401 }, "blocked", /login \(401\)/],
    [{ status: 403 }, "blocked", /script \(403\)/],
    [{ status: 429 }, "blocked", /too many requests \(429\)/],
    [{ status: 406 }, "blocked", /unexpected answer 406; check by hand/],
    [{ status: 302 }, "blocked", /unexpected answer 302/],
    [{ failure: "dns" }, "broken", /host name does not exist/],
    [{ failure: "refused" }, "broken", /refused the connection/],
    [{ failure: "tls", detail: "certificate has expired" }, "broken", /^TLS error: certificate has expired$/],
    [{ failure: "unsafe_url", detail: "a local or private address (10.0.0.1)" }, "broken", /^not requested: a local or private address/],
    [{ failure: "timeout", detail: "15 s" }, "blocked", /^no answer in 15 s$/],
    [{ failure: "timeout" }, "blocked", /^no answer in time$/],
    [{ failure: "network", detail: "ECONNRESET read ECONNRESET" }, "blocked", /connection failed: ECONNRESET/],
    [{ failure: "redirects", detail: "more than 5" }, "blocked", /too many redirects/],
  ])("%j is %s", (probe, outcome, reason) => {
    const verdict = classify(probe);
    expect(verdict.outcome).toBe(outcome);
    expect(verdict.reason).toMatch(reason);
  });
});

/** The shape Node's fetch throws: "fetch failed" with the real error in `cause`. */
function fetchFailed(cause: object): Error {
  return Object.assign(new TypeError("fetch failed"), { cause });
}

describe("failureOf", () => {
  it("reads the timeout from the abort", () => {
    expect(failureOf(new DOMException("The operation was aborted due to timeout", "TimeoutError"))).toEqual({ failure: "timeout" });
    expect(failureOf(fetchFailed({ code: "UND_ERR_CONNECT_TIMEOUT", message: "Connect Timeout Error" }))).toEqual({ failure: "timeout" });
  });

  it("reads DNS failures and refused connections from the cause", () => {
    expect(failureOf(fetchFailed({ code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND x.invalid" }))).toEqual({ failure: "dns" });
    expect(failureOf(fetchFailed({ code: "ECONNREFUSED", message: "connect ECONNREFUSED 1.2.3.4:443" }))).toEqual({ failure: "refused" });
    // A host with several addresses fails with an AggregateError.
    const aggregate = Object.assign(new AggregateError([{ code: "ECONNREFUSED", message: "connect ECONNREFUSED" }], ""), { code: "ECONNREFUSED" });
    expect(failureOf(fetchFailed(aggregate))).toEqual({ failure: "refused" });
  });

  it("reads TLS errors, and says when a browser may still open the page", () => {
    expect(failureOf(fetchFailed({ code: "CERT_HAS_EXPIRED", message: "certificate has expired" }))).toEqual({
      failure: "tls",
      detail: "certificate has expired",
    });
    expect(failureOf(fetchFailed({ code: "ERR_TLS_CERT_ALTNAME_INVALID", message: "Hostname/IP does not match" })).failure).toBe("tls");
    const leaf = failureOf(fetchFailed({ code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE", message: "unable to verify the first certificate" }));
    expect(leaf.failure).toBe("tls");
    expect(leaf.detail).toContain("intermediate certificate");
  });

  it("calls anything else a network failure, with the code", () => {
    expect(failureOf(fetchFailed({ code: "ECONNRESET", message: "read ECONNRESET" }))).toEqual({ failure: "network", detail: "read ECONNRESET" });
    expect(failureOf(fetchFailed({ code: "UND_ERR_SOCKET", message: "other side closed" }))).toEqual({
      failure: "network",
      detail: "UND_ERR_SOCKET other side closed",
    });
    expect(failureOf(new Error("boom"))).toEqual({ failure: "network", detail: "boom" });
  });
});
