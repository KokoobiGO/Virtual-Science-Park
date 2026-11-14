import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  locale: undefined as string | undefined,
  set: vi.fn(),
  refresh: vi.fn(),
  signInWithPassword: vi.fn(async () => ({ data: { user: null }, error: { message: "Invalid login credentials" } })),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "vsp_locale" && mocks.locale ? { value: mocks.locale } : undefined),
    set: mocks.set,
  }),
}));
vi.mock("next/cache", () => ({ refresh: mocks.refresh }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signInWithPassword: mocks.signInWithPassword, signOut: vi.fn() } }),
}));

const { setLocale } = await import("./locale");
const { signIn } = await import("./auth");

const form = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.set(k, v);
  return data;
};

beforeEach(() => {
  mocks.locale = undefined;
  mocks.set.mockClear();
  mocks.refresh.mockClear();
});

describe("setLocale (C19)", () => {
  it("stores the choice in a year-long cookie the inline script can read, then refreshes", async () => {
    await setLocale(form({ locale: "sv" }));
    expect(mocks.set).toHaveBeenCalledWith(
      "vsp_locale",
      "sv",
      expect.objectContaining({ path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: false }),
    );
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("stores English for anything it does not know", async () => {
    await setLocale(form({ locale: "de" }));
    expect(mocks.set).toHaveBeenCalledWith("vsp_locale", "en", expect.anything());
  });
});

describe("signIn errors follow the language (C19)", () => {
  it("answers in English by default and keeps the typed email", async () => {
    expect(await signIn({ error: null }, form({ email: "", password: "" }))).toEqual({ error: "Enter your email and password.", email: "" });
    expect(await signIn({ error: null }, form({ email: "a@b.test", password: "x" }))).toEqual({
      error: "That email and password do not match. Check for typos and try again.",
      email: "a@b.test",
    });
  });

  it("answers in Swedish with the Swedish cookie", async () => {
    mocks.locale = "sv";
    expect((await signIn({ error: null }, form({ email: "a@b.test", password: "x" }))).error).toBe("E-postadressen och lösenordet stämmer inte. Kontrollera stavningen och försök igen.");
  });
});
