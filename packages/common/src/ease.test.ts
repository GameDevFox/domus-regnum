import { ease } from "./ease";

describe("ease", () => {
  describe("linear", () => {
    it("passes t through unchanged", () => {
      expect(ease.linear(0)).toBe(0);
      expect(ease.linear(0.5)).toBe(0.5);
      expect(ease.linear(1)).toBe(1);
    });
  });

  describe("invert", () => {
    it("flips the output of a function", () => {
      const inverted = ease.invert(ease.linear);
      expect(inverted(0)).toBe(1);
      expect(inverted(1)).toBe(0);
      expect(inverted(0.25)).toBe(0.75);
    });
  });

  describe("quadIn", () => {
    it("starts at 0 and ends at 1", () => {
      expect(ease.quadIn()(0)).toBe(0);
      expect(ease.quadIn()(1)).toBe(1);
    });

    it("is slow at the start (below linear at t=0.5)", () => {
      expect(ease.quadIn()(0.5)).toBe(0.25);
    });

    it("respects custom power", () => {
      expect(ease.quadIn(3)(0.5)).toBe(0.125);
    });
  });

  describe("quadOut", () => {
    it("starts at 0 and ends at 1", () => {
      expect(ease.quadOut()(0)).toBe(0);
      expect(ease.quadOut()(1)).toBe(1);
    });

    it("is fast at the start (above linear at t=0.5)", () => {
      expect(ease.quadOut()(0.5)).toBe(0.75);
    });

    it("respects custom power", () => {
      expect(ease.quadOut(3)(0.5)).toBe(0.875);
    });
  });

  describe("quadInOut", () => {
    it("starts at 0 and ends at 1", () => {
      expect(ease.quadInOut()(0)).toBe(0);
      expect(ease.quadInOut()(1)).toBe(1);
    });

    it("passes through 0.5 at the midpoint", () => {
      expect(ease.quadInOut()(0.5)).toBe(0.5);
    });

    it("is slow at the start and fast at the end relative to linear", () => {
      expect(ease.quadInOut()(0.25)).toBeLessThan(0.25);
      expect(ease.quadInOut()(0.75)).toBeGreaterThan(0.75);
    });
  });
});
