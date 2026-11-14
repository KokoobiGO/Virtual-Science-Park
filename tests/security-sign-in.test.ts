/**
 * The sign-in form's `next` parameter (docs/security-review.md, F5).
 *
 * After a good sign-in, signIn() redirects to `next` when it matches
 * /^\/(?!\/)/. That stops "//evil.example" but not "/\evil.example" or
 * "/<tab>/evil.example": browsers read a backslash as a slash and drop tabs,
 * so both land on evil.example. Shown for real on 2026-11-14 against the local
 * dev server: the form answered HTTP 303 with Location "/\evil.example/landing".
 *
 * `it.fails` marks the hole: the test states what we want and fails today, so
 * Vitest reports it as passing. When the fix lands, turn it into a plain `it`.
 * Supabase and the cookies are mocked, as in app/actions/actions.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

class Redirected extends Error {
  constructor(readonly to: string) {
    super(`redirect to ${to}`);
  }
}

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: vi.fn() }),
}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirected(to);
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signInWithPassword: mocks.signInWithPassword, signOut: vi.fn() } }),
}));

const { signIn } = await import("@/app/actions/auth");

const BACKSLASH = String.fromCharCode(92);
const TAB = String.fromCharCode(9);

/** Where a good sign-in with this `next` sends the browser, resolved the way a browser resolves a Location header. */
async function landing(next: string): Promise<string> {
  const form = new FormData();
  form.set("email", "member@demo.vsp.test");
  form.set("password", "not-a-real-password");
  form.set("next", next);
  try {
    await signIn({ error: null }, form);
  } catch (error) {
    if (error instanceof Redirected) return new URL(error.to, "https://vsp.example/sign-in").href;
    throw error;
  }
  throw new Error("signIn did not redirect");
}

beforeEach(() => {
  mocks.signInWithPassword.mockResolvedValue({
    data: { user: { app_metadata: { role: "member", company_id: "6f1c2a3b-0000-4000-8000-000000000000" } } },
    error: null,
  });
});

describe("signIn: next stays on this site (F5)", () => {
  it("follows a path on this site", async () => {
    expect(await landing("/explore?kind=funding")).toBe("https://vsp.example/explore?kind=funding");
  });

  it("ignores a protocol-relative address and lands on the role's home page", async () => {
    expect(await landing("//evil.example/landing")).toBe("https://vsp.example/week");
  });

  it.fails("never leaves the site for a backslash path [open: lands on evil.example today]", async () => {
    expect(new URL(await landing(`/${BACKSLASH}evil.example/landing`)).host).toBe("vsp.example");
  });

  it.fails("never leaves the site for a path with a tab after the first slash [open: lands on evil.example today]", async () => {
    expect(new URL(await landing(`/${TAB}/evil.example/landing`)).host).toBe("vsp.example");
  });
});
