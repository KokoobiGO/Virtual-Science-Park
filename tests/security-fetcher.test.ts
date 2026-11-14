/**
 * The page fetcher's private-address check (docs/security-review.md, F3).
 *
 * publicHttpUrl() is the only guard between a URL from outside (a member's
 * website and its redirects, a source's link, a Scout result, the staff fetch
 * form) and a request from our server. It compares the host name as text and
 * never looks at the address the name resolves to.
 *
 * `it.fails` marks a hole that is open today: the test states what we want
 * and fails, so Vitest reports it as passing. When the fix lands, `it.fails`
 * turns red and must become a plain `it`. Pure: no request is made.
 *
 * Shown for real on 2026-11-14 against the local dev server: fetchPage()
 * fetched http://[::ffff:127.0.0.1]:3000/sign-in and http://[::]:3000/sign-in
 * (HTTP 200, the sign-in page). A public DNS name that points at 127.0.0.1
 * (or one that changes its answer between check and fetch) passes too; that
 * needs a resolve-and-pin fix and cannot be shown without a DNS lookup here.
 */
import { describe, expect, it } from "vitest";
import { publicHttpUrl } from "../lib/fetcher/fetch-page";

const isRefused = (url: string) => {
  try {
    publicHttpUrl(url);
    return false;
  } catch {
    return true;
  }
};

describe("publicHttpUrl: private and local addresses (F3)", () => {
  it("refuses the plain forms of loopback, private, link-local and metadata addresses", () => {
    for (const url of [
      "http://localhost/",
      "http://127.0.0.1/",
      "http://2130706433/", // 127.0.0.1 as one number; the URL parser rewrites it
      "http://0x7f.1/",
      "http://0.0.0.0/",
      "http://10.1.2.3/",
      "http://172.16.0.1/",
      "http://192.168.1.1/",
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]/",
      "http://[fd00::1]/",
      "http://[fe80::1]/",
      "file:///etc/passwd",
      "gopher://127.0.0.1/",
    ]) {
      expect(isRefused(url), url).toBe(true);
    }
  });

  it("accepts an ordinary public page", () => {
    expect(isRefused("https://www.vinnova.se/")).toBe(false);
  });

  it.fails("refuses loopback written as an IPv4-mapped IPv6 address [open: fetched today]", () => {
    expect(isRefused("http://[::ffff:127.0.0.1]:3000/")).toBe(true);
  });

  it.fails("refuses the unspecified IPv6 address, which reaches the server itself [open: fetched today]", () => {
    expect(isRefused("http://[::]:3000/")).toBe(true);
  });

  it.fails("refuses the cloud metadata address written as an IPv4-mapped IPv6 address [open: accepted today]", () => {
    expect(isRefused("http://[::ffff:a9fe:a9fe]/latest/meta-data/")).toBe(true);
  });

  it.fails("refuses a private network written as an IPv4-mapped IPv6 address [open: accepted today]", () => {
    expect(isRefused("http://[::ffff:10.0.0.1]/")).toBe(true);
  });

  it.fails("refuses the shared address space 100.64.0.0/10 used inside cloud networks [open: accepted today]", () => {
    expect(isRefused("http://100.64.0.1/")).toBe(true);
  });
});
