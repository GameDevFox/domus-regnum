import { consecutivePairs } from "./consecutive-pairs";

describe("consecutivePairs", () => {
  it("returns consecutive pairs", () => {
    expect(consecutivePairs([1, 2, 3, 4])).toEqual([[1, 2], [2, 3], [3, 4]]);
  });

  it("returns a single consecutivePairs for a two-element array", () => {
    expect(consecutivePairs(["a", "b"])).toEqual([["a", "b"]]);
  });

  it("returns empty for a single-element array", () => {
    expect(consecutivePairs([42])).toEqual([]);
  });

  it("returns empty for an empty array", () => {
    expect(consecutivePairs([])).toEqual([]);
  });
});
