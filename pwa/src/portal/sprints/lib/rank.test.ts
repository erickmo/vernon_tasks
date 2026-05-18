import { describe, it, expect } from "vitest";
import { computeRank, needsRebalance, RANK_STEP, RANK_COLLISION_FLOOR } from "./rank";

describe("computeRank", () => {
  it("midpoint between two ranks", () => {
    expect(computeRank(1000, 2000)).toBe(1500);
  });
  it("top of column (no prev)", () => {
    expect(computeRank(null, 2000)).toBe(1000);
  });
  it("bottom of column (no next)", () => {
    expect(computeRank(5000, null)).toBe(6000);
  });
  it("empty column", () => {
    expect(computeRank(null, null)).toBe(1000);
  });
});

describe("needsRebalance", () => {
  it("returns true when gap below floor", () => {
    expect(needsRebalance(1000, 1000 + RANK_COLLISION_FLOOR / 2)).toBe(true);
  });
  it("returns false for normal gap", () => {
    expect(needsRebalance(1000, 2000)).toBe(false);
  });
});

describe("constants", () => {
  it("step is 1000", () => expect(RANK_STEP).toBe(1000));
});
