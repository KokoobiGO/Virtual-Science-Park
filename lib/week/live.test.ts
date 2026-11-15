import { describe, expect, it } from "vitest";
import {
  changedByProfile,
  changeLine,
  orderChange,
  parseSeen,
  PENDING_FOR_MS,
  previousTops,
  rebuiltSince,
  rerankPending,
  statusJson,
  type SeenOrder,
} from "./live";

const at = (iso: string) => new Date(iso);

describe("rerankPending", () => {
  const now = at("2026-11-14T21:00:00Z");

  it("is true while the profile changed after the cards were built, for a while", () => {
    expect(rerankPending({ builtAt: at("2026-11-14T20:00:00Z"), profileChangedAt: at("2026-11-14T20:59:00Z") }, now)).toBe(true);
    expect(rerankPending({ builtAt: null, profileChangedAt: at("2026-11-14T20:59:00Z") }, now)).toBe(true);
  });

  it("is false once the cards are newer than the change", () => {
    expect(rerankPending({ builtAt: at("2026-11-14T20:59:30Z"), profileChangedAt: at("2026-11-14T20:59:00Z") }, now)).toBe(false);
    expect(rerankPending({ builtAt: at("2026-11-14T20:00:00Z"), profileChangedAt: null }, now)).toBe(false);
  });

  it("gives up after a while, so a chain that never builds cards does not leave the page waiting", () => {
    const changed = new Date(now.getTime() - PENDING_FOR_MS - 1000);
    expect(rerankPending({ builtAt: at("2026-11-14T18:00:00Z"), profileChangedAt: changed }, now)).toBe(false);
  });

  it("is sent as JSON with ISO times", () => {
    expect(statusJson({ weekOf: "2026-11-09", builtAt: at("2026-11-14T20:00:00Z"), profileChangedAt: at("2026-11-14T20:59:00Z") }, now)).toEqual({
      weekOf: "2026-11-09",
      builtAt: "2026-11-14T20:00:00.000Z",
      profileChangedAt: "2026-11-14T20:59:00.000Z",
      pending: true,
    });
    expect(statusJson({ weekOf: null, builtAt: null, profileChangedAt: null }, now)).toEqual({ weekOf: null, builtAt: null, profileChangedAt: null, pending: false });
  });
});

describe("the order shown before", () => {
  const seen: SeenOrder = { weekOf: "2026-11-09", builtAt: "2026-11-14T20:00:00.000Z", keys: ["opportunity:a", "trend:t"] };

  it("reads back what was stored, and nothing broken", () => {
    expect(parseSeen(JSON.stringify(seen))).toEqual(seen);
    expect(parseSeen(null)).toBeNull();
    expect(parseSeen("not json")).toBeNull();
    expect(parseSeen(JSON.stringify({ weekOf: "2026-11-09", keys: [1] }))).toBeNull();
  });

  it("counts a new build of the same week as a re-rank, but not a new week or the same build", () => {
    expect(rebuiltSince(seen, { ...seen, builtAt: "2026-11-14T21:00:00.000Z" })).toBe(true);
    expect(rebuiltSince(seen, { ...seen, weekOf: "2026-11-16", builtAt: "2026-11-16T05:00:00.000Z" })).toBe(false);
    expect(rebuiltSince(seen, seen)).toBe(false);
    expect(rebuiltSince(null, seen)).toBe(false);
  });

  it("blames the profile only when it changed after the cards shown before", () => {
    expect(changedByProfile("2026-11-14T20:30:00.000Z", seen.builtAt)).toBe(true);
    expect(changedByProfile("2026-11-14T19:30:00.000Z", seen.builtAt)).toBe(false);
    expect(changedByProfile(null, seen.builtAt)).toBe(false);
  });
});

describe("orderChange and changeLine", () => {
  it("counts one card that jumped to the top as one move", () => {
    expect(orderChange(["a", "b", "c", "d", "e"], ["e", "a", "b", "c", "d"])).toEqual({ added: 0, dropped: 0, moved: 1 });
  });

  it("counts new and dropped cards, and does not count the shift they cause as moves", () => {
    expect(orderChange(["a", "b", "c", "d"], ["x", "a", "b", "c"])).toEqual({ added: 1, dropped: 1, moved: 0 });
    expect(orderChange(["a", "b", "c"], ["c", "b", "a"])).toEqual({ added: 0, dropped: 0, moved: 2 });
  });

  it("says what changed in one short line", () => {
    expect(changeLine(true, { added: 1, dropped: 1, moved: 2 })).toBe("Re-ranked after your profile change: 1 new card, 1 dropped, 2 moved.");
    expect(changeLine(false, { added: 2, dropped: 0, moved: 0 })).toBe("Your cards were re-ranked: 2 new cards.");
    expect(changeLine(true, { added: 0, dropped: 0, moved: 0 })).toBe("Re-ranked after your profile change: the same cards in the same order.");
  });

  it("says it in Swedish too", () => {
    expect(changeLine(true, { added: 1, dropped: 2, moved: 0 }, "sv")).toBe("Omrangordnat efter er profiländring: 1 nytt kort, 2 borttagna.");
    expect(changeLine(false, { added: 0, dropped: 0, moved: 0 }, "sv")).toBe("Era kort har rangordnats om: samma kort i samma ordning.");
  });

  it("never claims a card is a decision", () => {
    expect(changeLine(true, { added: 3, dropped: 3, moved: 3 })).not.toMatch(/eligible/i);
  });
});

describe("previousTops", () => {
  it("lays the old order out with the cards' current heights, leaving new cards out", () => {
    const rows = [
      { key: "b", top: 100, height: 200 },
      { key: "a", top: 316, height: 100 },
      { key: "new", top: 432, height: 50 },
    ];
    // Old order a, gone, b: a first at the list's top, then b below it.
    expect(previousTops(["a", "gone", "b"], rows, 16)).toEqual(
      new Map([
        ["a", 100],
        ["b", 216],
      ]),
    );
    expect(previousTops(["a"], [], 16)).toEqual(new Map());
  });
});
