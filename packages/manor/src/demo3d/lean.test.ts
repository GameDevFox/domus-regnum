import { describe, expect, it } from "vitest";

import { leanFor } from "./lean";

const DEGREE = Math.PI / 180;
/** The lean in degrees for a camera so many degrees above level. */
const lean = (elevation: number): number => leanFor(elevation * DEGREE) / DEGREE;

describe("how far a character's picture leans back", () => {
  it("is not at all while the camera is no higher than the picture was drawn from", () => {
    expect(lean(0)).toBe(0);
    expect(lean(12)).toBe(0);
    expect(lean(30)).toBe(0);
  });

  it("is a little over a third of what the camera is above that", () => {
    expect(lean(40)).toBeCloseTo(3.5);
    expect(lean(60)).toBeCloseTo(10.5);
  });

  it("stops at 16 degrees however high the camera goes", () => {
    expect(lean(78)).toBeCloseTo(16);
    expect(lean(90)).toBeCloseTo(16);
    expect(lean(74)).toBeCloseTo(15.4);
  });

  it("still more than doubles how much of a figure shows from the steepest view", () => {
    // Seen from 78 degrees up, an upright picture shows cos(78°) of its height; leaning, cos(78° - lean).
    const upright = Math.cos(78 * DEGREE);
    const leaning = Math.cos((78 - lean(78)) * DEGREE);
    expect(upright).toBeLessThan(0.22);
    expect(leaning).toBeGreaterThan(0.45);
  });
});
