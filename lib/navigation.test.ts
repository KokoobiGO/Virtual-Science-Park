import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import { HOME, NAV, ROLE_ONLY, SHARED_NAV, SIGNED_IN_ONLY, isCurrentPath } from "./navigation";
import type { AppRole } from "./schemas";

const startsWith = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);
/** The same rule proxy.ts applies. */
const allowed = (path: string, role: AppRole) => !ROLE_ONLY.some((r) => startsWith(path, r.prefix) && r.role !== role);

describe("menus by role", () => {
  it("gives members and staff their own menus", () => {
    expect(NAV.member.map((i) => i.href)).toEqual(["/week", "/profile", "/explore", "/scout", "/copilot", "/trust"]);
    expect(NAV.staff.map((i) => i.href)).toEqual([
      "/staff/compare",
      "/staff/ecosystem",
      "/profile",
      "/staff/handoffs",
      "/explore",
      "/staff/injection-demo",
      "/trust",
      "/staff/checks",
    ]);
  });

  it("only links to pages the role may open", () => {
    for (const role of ["member", "staff"] as const) {
      for (const item of [...NAV[role], ...SHARED_NAV]) expect(allowed(item.href, role), `${role} ${item.href}`).toBe(true);
      expect(allowed(HOME[role], role)).toBe(true);
    }
  });

  it("keeps staff pages out of the member menu", () => {
    expect(NAV.member.some((i) => i.href.startsWith("/staff"))).toBe(false);
    expect(allowed("/staff/compare", "member")).toBe(false);
    expect(allowed("/week", "staff")).toBe(false);
  });

  it("needs a signed-in user for every menu page, the data status page included", () => {
    for (const item of [...NAV.member, ...NAV.staff, ...SHARED_NAV]) {
      expect(SIGNED_IN_ONLY.some((p) => startsWith(item.href, p)), item.href).toBe(true);
    }
  });

  it("keeps backlog ids out of what users read: the label and the description (C20)", () => {
    for (const item of [...NAV.member, ...NAV.staff, ...SHARED_NAV]) {
      expect(`${item.label} ${item.description}`, item.href).not.toMatch(/\b[ABCDS]\d{1,2}\b|backlog/i);
    }
  });

  it("has no duplicate links in a menu and a description for each", () => {
    for (const role of ["member", "staff"] as const) {
      const hrefs = NAV[role].map((i) => i.href);
      expect(new Set(hrefs).size).toBe(hrefs.length);
      for (const item of NAV[role]) expect(item.description.length).toBeGreaterThan(10);
    }
  });
});

describe("menu texts (C19)", () => {
  it("has the same English label and description in messages/en.json, so the menu reads as before", () => {
    for (const item of [...NAV.member, ...NAV.staff, ...SHARED_NAV]) {
      expect(en.nav[item.id], item.href).toEqual({ label: item.label, description: item.description });
    }
  });
});

describe("isCurrentPath", () => {
  it("matches the page and pages below it", () => {
    expect(isCurrentPath("/week", "/week")).toBe(true);
    expect(isCurrentPath("/staff/compare/abc", "/staff/compare")).toBe(true);
  });

  it("does not match a sibling that shares a prefix", () => {
    expect(isCurrentPath("/weekly", "/week")).toBe(false);
    expect(isCurrentPath("/staff/checks", "/staff/compare")).toBe(false);
  });

  it("matches the start page only on itself", () => {
    expect(isCurrentPath("/", "/")).toBe(true);
    expect(isCurrentPath("/week", "/")).toBe(false);
  });
});
