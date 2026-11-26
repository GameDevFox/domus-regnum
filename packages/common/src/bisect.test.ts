import { bisect } from "./bisect";

describe("bisect", () => {
  it("finds the exact value", () => {
    expect(bisect(0, 100, x => x - 42)).toBe(42);
  });

  it("returns min immediately when min === max", () => {
    expect(bisect(7, 7, () => 1)).toBe(7);
  });

  it("handles swapped min/max", () => {
    expect(bisect(100, 0, x => x - 42)).toBe(42);
  });

  it("returns NEGATIVE_INFINITY when value is below the range", () => {
    expect(bisect(50, 100, x => x - 10)).toBe(Number.NEGATIVE_INFINITY);
  });

  it("returns POSITIVE_INFINITY when value is above the range", () => {
    expect(bisect(0, 30, x => x - 50)).toBe(Number.POSITIVE_INFINITY);
  });

  it("returns the floor when the target is not an integer", () => {
    expect(bisect(0, 100, x => x - 42.5)).toBe(42);
  });
});
