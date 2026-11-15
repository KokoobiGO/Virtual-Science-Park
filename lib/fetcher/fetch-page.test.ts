import { beforeEach, describe, expect, it, vi } from "vitest";

// fetchPage resolves names through node:dns/promises: answer from a table, so no test makes a real lookup.
const dns = vi.hoisted(() => ({ answers: new Map<string, { address: string; family: number }[]>() }));
vi.mock("node:dns/promises", () => ({
  lookup: async (host: string) => {
    const found = dns.answers.get(host);
    if (!found) throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${host}`), { code: "ENOTFOUND" });
    return found;
  },
}));

const { FetchPageError, fetchPage, isBlockedAddress, resolvePublicUrl } = await import("./fetch-page");

beforeEach(() => dns.answers.clear());

describe("isBlockedAddress", () => {
  it.each([
    "0.0.0.0",
    "10.20.30.40",
    "100.64.0.1",
    "100.127.255.254",
    "127.0.0.1",
    "169.254.169.254",
    "172.31.255.255",
    "192.0.0.8",
    "192.168.0.1",
    "198.18.0.1",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "0:0:0:0:0:ffff:a9fe:a9fe",
    "::ffff:10.0.0.1",
    "64:ff9b::7f00:1",
    "64:ff9b::192.168.1.1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "fe80::1%eth0",
    "ff02::1",
    "[::1]",
    "not an address",
    "",
  ])("blocks %s", (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each(["8.8.8.8", "100.63.255.255", "100.128.0.1", "172.32.0.1", "194.68.13.10", "2001:4860:4860::8888", "::ffff:8.8.8.8", "64:ff9b::808:808"])(
    "lets %s through",
    (address) => {
      expect(isBlockedAddress(address)).toBe(false);
    },
  );
});

describe("resolvePublicUrl", () => {
  const lookupOf = (answers: Record<string, string[]>) => async (host: string) => (answers[host] ?? []).map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));

  it("returns the URL and every address of a public name", async () => {
    const { url, addresses } = await resolvePublicUrl("https://www.example.se/om-oss", lookupOf({ "www.example.se": ["194.68.13.10", "2a00:1450::1"] }));
    expect(url.href).toBe("https://www.example.se/om-oss");
    expect(addresses.map((a) => a.address)).toEqual(["194.68.13.10", "2a00:1450::1"]);
  });

  it("refuses a public name that points at a private address, as a permanent error", async () => {
    const error = await resolvePublicUrl("http://localtest.me:3000/", lookupOf({ "localtest.me": ["127.0.0.1"] })).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FetchPageError);
    expect((error as InstanceType<typeof FetchPageError>).message).toContain("Local and private addresses cannot be fetched");
    expect((error as InstanceType<typeof FetchPageError>).permanent).toBe(true);
  });

  it("refuses a name when any one of its addresses is private", async () => {
    await expect(resolvePublicUrl("https://mixed.example.se/", lookupOf({ "mixed.example.se": ["194.68.13.10", "::ffff:169.254.169.254"] }))).rejects.toThrow(
      "points at ::ffff:169.254.169.254",
    );
  });

  it("checks an IP literal without a lookup", async () => {
    const lookup = vi.fn();
    expect((await resolvePublicUrl("http://194.68.13.10/", lookup)).addresses).toEqual([{ address: "194.68.13.10", family: 4 }]);
    await expect(resolvePublicUrl("http://[::ffff:127.0.0.1]:3000/", lookup)).rejects.toThrow("Local and private addresses");
    expect(lookup).not.toHaveBeenCalled();
  });

  it("treats a name that does not resolve as a passing failure", async () => {
    const error = await resolvePublicUrl("https://nowhere.example.se/", lookupOf({})).catch((e: unknown) => e);
    expect((error as InstanceType<typeof FetchPageError>).permanent).toBe(false);
  });
});

describe("fetchPage", () => {
  it("refuses a name that resolves to a private address before connecting", async () => {
    dns.answers.set("rebind.example.se", [{ address: "10.0.0.7", family: 4 }]);
    await expect(fetchPage("https://rebind.example.se/")).rejects.toThrow("rebind.example.se points at 10.0.0.7");
  });

  it("refuses the local forms from the security review", async () => {
    await expect(fetchPage("http://[::ffff:127.0.0.1]:3000/sign-in")).rejects.toThrow("Local and private addresses");
    await expect(fetchPage("http://[::]:3000/sign-in")).rejects.toThrow("Local and private addresses");
    await expect(fetchPage("http://localhost.:3000/")).rejects.toThrow("Local and private addresses");
  });
});
