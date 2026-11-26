import { describe, expect, it } from "vitest";

import { nextStop } from "./turn";

const DEGREE = Math.PI / 180;
/** Where a turn ends, in whole degrees, from a start in degrees. */
const from = (degrees: number, direction: 1 | -1): number => Math.round(nextStop(degrees * DEGREE, direction) / DEGREE);

describe("the Turn buttons", () => {
  it("go from straight-on to the diagonal on that side", () => {
    expect(from(0, 1)).toBe(45);
    expect(from(0, -1)).toBe(-45);
  });

  it("finish the journey to the diagonal ahead from an odd angle between two", () => {
    expect(from(26, 1)).toBe(45);
    expect(from(26, -1)).toBe(-45);
    expect(from(-20, 1)).toBe(45);
    expect(from(100, -1)).toBe(45);
  });

  it("go on to the next diagonal when already on one, or near enough", () => {
    expect(from(45, 1)).toBe(135);
    expect(from(45, -1)).toBe(-45);
    expect(from(50, 1)).toBe(135);
    expect(from(50, -1)).toBe(-45);
    expect(from(38, 1)).toBe(135);
    expect(from(38, -1)).toBe(-45);
  });

  it("draw the line 15 degrees off a diagonal: inside it you are on that diagonal, outside you are not", () => {
    // Just inside, turning back leaves the diagonal for the one before; just outside, it only returns to it.
    expect(from(59, -1)).toBe(-45);
    expect(from(61, -1)).toBe(45);
    expect(from(31, 1)).toBe(135);
    expect(from(29, 1)).toBe(45);
  });

  it("always turn the way asked, and never by more than a quarter-turn and a bit", () => {
    for (let degrees = -720; degrees <= 720; degrees += 7) {
      for (const direction of [1, -1] as const) {
        const by = (nextStop(degrees * DEGREE, direction) - degrees * DEGREE) * direction;
        expect(by / DEGREE).toBeGreaterThan(14.9);
        expect(by / DEGREE).toBeLessThanOrEqual(105.1);
      }
    }
  });

  it("carry on round past the back of the house", () => {
    expect(from(170, 1)).toBe(225);
    expect(from(-170, -1)).toBe(-225);
    expect(from(315, 1)).toBe(405);
  });
});
