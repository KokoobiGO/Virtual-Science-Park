import { beforeEach, describe, expect, it, vi } from "vitest";

const COMPANY = "0ee4a9be-1eb0-418a-9e8a-9bcbd1ff5648";

const mocks = vi.hoisted(() => ({
  viewer: null as null | { role: "member" | "staff"; companyId: string | null; claims: { sub: string } },
  send: vi.fn(async () => ({ ids: ["event-1"] })),
  refresh: vi.fn(),
  updates: [] as unknown[],
  inserts: [] as unknown[],
  /** company_private rows the stand-in transaction returns. */
  privateRows: [] as { userPriorities: string[] }[],
}));

vi.mock("@/lib/auth", () => ({ getViewer: async () => mocks.viewer }));
vi.mock("next/cache", () => ({ refresh: mocks.refresh }));
vi.mock("@/lib/inngest/client", () => ({ inngest: { send: mocks.send } }));
vi.mock("@/lib/db/user", () => ({
  // A stand-in for the member's transaction: reads return `privateRows`.
  withUserDb: async (_claims: unknown, run: (tx: unknown) => Promise<unknown>) =>
    run({
      select: () => ({ from: () => ({ where: async () => mocks.privateRows }) }),
      update: () => ({
        set: (values: unknown) => {
          mocks.updates.push(values);
          return { where: async () => undefined };
        },
      }),
      insert: () => ({
        values: async (values: unknown) => {
          mocks.inserts.push(values);
        },
      }),
    }),
}));

const { saveClaim, reviewSuggestion, setPriority } = await import("./actions");

const form = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.set(k, v);
  return data;
};

beforeEach(() => {
  mocks.viewer = { role: "member", companyId: COMPANY, claims: { sub: "user-1" } };
  mocks.privateRows = [{ userPriorities: ["funding"] }];
  mocks.updates.length = 0;
  mocks.inserts.length = 0;
  mocks.send.mockClear();
  mocks.refresh.mockClear();
});

describe("profile actions", () => {
  it("refuse staff and signed-out users, and write nothing", async () => {
    for (const viewer of [null, { role: "staff" as const, companyId: null, claims: { sub: "staff-1" } }]) {
      mocks.viewer = viewer;
      expect((await setPriority("testing", true)).error).toMatch(/Only a member/);
      expect((await saveClaim({ error: null }, form({ field: "summary", claimId: "", value: "x" }))).error).toMatch(/Only a member/);
      expect((await reviewSuggestion({ error: null }, form({ claimId: COMPANY, decision: "accept" }))).error).toMatch(/Only a member/);
    }
    expect(mocks.updates).toEqual([]);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("refuse bad input before touching the database", async () => {
    expect((await setPriority("holidays", true)).error).toBe("Unknown priority.");
    expect((await saveClaim({ error: null }, form({ field: "ceo", value: "x" }))).error).toBe("Unknown profile field.");
    expect((await saveClaim({ error: null }, form({ field: "offerings", value: " \n " }))).error).toMatch(/at least one item/);
    expect((await reviewSuggestion({ error: null }, form({ claimId: "not-a-uuid", decision: "accept" }))).error).toBe("Unknown suggestion.");
    expect(mocks.updates).toEqual([]);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("switch a priority in company_private and ask the matcher to re-rank this company", async () => {
    expect(await setPriority("testing", true)).toEqual({ error: null });
    expect(mocks.updates).toEqual([expect.objectContaining({ userPriorities: ["funding", "testing"] })]);
    expect(mocks.send).toHaveBeenCalledWith({ name: "app/company.profile.changed", data: { companyId: COMPANY } });
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("create the company_private row when the member has none yet", async () => {
    mocks.privateRows = [];
    expect(await setPriority("events", true)).toEqual({ error: null });
    expect(mocks.updates).toEqual([]);
    expect(mocks.inserts).toEqual([{ companyId: COMPANY, userPriorities: ["events"] }]);
  });

  it("keep the change when Inngest cannot be reached", async () => {
    mocks.send.mockRejectedValueOnce(new Error("connect ECONNREFUSED 127.0.0.1:8288"));
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await setPriority("market", true)).toEqual({ error: null });
    expect(mocks.updates).toHaveLength(1);
    quiet.mockRestore();
  });
});
