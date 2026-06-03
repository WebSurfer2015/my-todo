/**
 * Tests for core/src/filters.ts — pinned-filter set logic, Home stat
 * tile toggling, and view defaults, lifted out of mobile's
 * useProfileSlice (task #3). Hosted under web's Vitest (web -> core is
 * the allowed dependency direction).
 */
import { describe, expect, it } from "vitest";
import {
  PIN_LIMIT,
  DEFAULT_HOME_STAT_TILES,
  filterSetKey,
  togglePinnedFilter,
  addPinnedFilter,
  stripFilterFromPinned,
  toggleStatTile,
  defaultFilterForView,
} from "../../core/src/filters";

describe("filterSetKey", () => {
  it("is order-insensitive", () => {
    expect(filterSetKey(["done", "cat:work"])).toBe(
      filterSetKey(["cat:work", "done"]),
    );
  });
});

describe("togglePinnedFilter", () => {
  it("adds a new set", () => {
    const res = togglePinnedFilter(undefined, ["done"]);
    expect(res).toEqual({ pinned: [["done"]], limitReached: false });
  });

  it("removes an existing set order-insensitively", () => {
    const res = togglePinnedFilter([["cat:work", "done"]], ["done", "cat:work"]);
    expect(res.pinned).toBeUndefined(); // last one removed → undefined
    expect(res.limitReached).toBe(false);
  });

  it("keeps other sets when removing one", () => {
    const res = togglePinnedFilter([["open"], ["done"]], ["open"]);
    expect(res.pinned).toEqual([["done"]]);
  });

  it("is a no-op (same ref) for an empty set", () => {
    const pinned = [["done"]];
    expect(togglePinnedFilter(pinned, []).pinned).toBe(pinned);
  });

  it("blocks an add at the cap and returns the same ref", () => {
    const pinned = Array.from({ length: PIN_LIMIT }, (_, i) => [`cat:c${i}`]);
    const res = togglePinnedFilter(pinned, ["done"]);
    expect(res.limitReached).toBe(true);
    expect(res.pinned).toBe(pinned);
  });

  it("still removes at the cap (toggle off is never blocked)", () => {
    const pinned = Array.from({ length: PIN_LIMIT }, (_, i) => [`cat:c${i}`]);
    const res = togglePinnedFilter(pinned, ["cat:c0"]);
    expect(res.limitReached).toBe(false);
    expect(res.pinned).toHaveLength(PIN_LIMIT - 1);
  });
});

describe("addPinnedFilter", () => {
  it("adds when absent", () => {
    expect(addPinnedFilter([["open"]], ["done"]).pinned).toEqual([
      ["open"],
      ["done"],
    ]);
  });

  it("is a no-op (same ref) when already present (order-insensitive)", () => {
    const pinned = [["cat:work", "done"]];
    const res = addPinnedFilter(pinned, ["done", "cat:work"]);
    expect(res.pinned).toBe(pinned);
    expect(res.limitReached).toBe(false);
  });

  it("blocks at the cap", () => {
    const pinned = Array.from({ length: PIN_LIMIT }, (_, i) => [`cat:c${i}`]);
    expect(addPinnedFilter(pinned, ["done"]).limitReached).toBe(true);
  });
});

describe("stripFilterFromPinned", () => {
  it("removes the id from composite sets and drops emptied sets", () => {
    const pinned = [["done", "cat:work"], ["done"], ["open"]];
    const out = stripFilterFromPinned(pinned, "done");
    expect(out).toEqual([["cat:work"], ["open"]]); // ['done'] dropped
  });

  it("returns the same ref when the id is absent", () => {
    const pinned = [["open"], ["cat:work"]];
    expect(stripFilterFromPinned(pinned, "done")).toBe(pinned);
  });

  it("returns undefined when stripping empties the whole list", () => {
    expect(stripFilterFromPinned([["done"]], "done")).toBeUndefined();
  });

  it("handles undefined input", () => {
    expect(stripFilterFromPinned(undefined, "done")).toBeUndefined();
  });
});

describe("toggleStatTile", () => {
  it("materializes the defaults then removes a default on first toggle", () => {
    expect(toggleStatTile(undefined, "done")).toEqual(
      DEFAULT_HOME_STAT_TILES.filter((x) => x !== "done"),
    );
  });

  it("adds a tile not in the current list", () => {
    expect(toggleStatTile(["cat:home"], "done")).toEqual(["cat:home", "done"]);
  });

  it("removes a tile that is present", () => {
    expect(toggleStatTile(["cat:home", "done"], "done")).toEqual(["cat:home"]);
  });

  it("treats an explicit empty array as empty (not defaults)", () => {
    expect(toggleStatTile([], "done")).toEqual(["done"]);
  });
});

describe("defaultFilterForView", () => {
  it("category opens on all, status on open", () => {
    expect(defaultFilterForView("category")).toBe("all");
    expect(defaultFilterForView("status")).toBe("open");
  });
});
