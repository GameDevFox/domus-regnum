import { describe, expect, it } from "vitest";

import { HOUSE } from "./house-plan";
import { flightAt, riseOf, stepsOf, treadHeight } from "./stairs";
import type { Plan, Stair } from "./types";

// A flight of stairs at its edges: where it begins and ends, and how many steps it is made of.

/** A storey up of three metres: sixteen and two thirds of the step a flight aims for, so seventeen. */
const PLAN: Plan = { ...HOUSE, storeys: { ...HOUSE.storeys, ground: { ...HOUSE.storeys.ground, y: 0 }, first: { ...HOUSE.storeys.first, y: 3 } } };
const STAIR: Stair = { id: "test", lower: "ground", upper: "first", x: 4, zFoot: 10, zHead: 6, width: 1 };
const PLANNED: Plan = { ...PLAN, stairs: [STAIR] };
const STEPS = 17;

describe("the steps of a flight", () => {
  it("are as many as come nearest to the rise a step aims for, the real rise dividing the storey evenly", () => {
    expect(riseOf(PLANNED, STAIR)).toBe(3);
    expect(stepsOf(PLANNED, STAIR)).toBe(STEPS);
  });

  it("put the foot on the floor, the first tread a step up just past it, and the head at the storey above", () => {
    const step = 3 / STEPS;
    expect(treadHeight(PLANNED, STAIR, STAIR.zFoot)).toBe(0);
    expect(treadHeight(PLANNED, STAIR, STAIR.zFoot - 0.01)).toBeCloseTo(step);
    expect(treadHeight(PLANNED, STAIR, STAIR.zHead)).toBeCloseTo(3);
    // (Past the head there is no tread higher than the floor above.)
    expect(treadHeight(PLANNED, STAIR, STAIR.zHead - 1)).toBeCloseTo(3);
  });
});

describe("the flight a point is on", () => {
  it("includes both ends of it, at the height of each storey and along every metre of its length", () => {
    const at = (y: number, z: number, x = STAIR.x) => flightAt(PLANNED, { x, y, z });
    expect(at(0, STAIR.zFoot)).toBe(STAIR);
    expect(at(3, STAIR.zHead)).toBe(STAIR);
    expect(at(1.5, STAIR.zFoot)).toBe(STAIR);
    expect(at(1.5, STAIR.zHead)).toBe(STAIR);
    expect(at(1.5, 8, STAIR.x - STAIR.width / 2)).toBe(STAIR);
    expect(at(1.5, 8, STAIR.x + STAIR.width / 2)).toBe(STAIR);
  });

  it("does not include what is past it, or above or below its storeys", () => {
    const at = (y: number, z: number, x = STAIR.x) => flightAt(PLANNED, { x, y, z });
    expect(at(1.5, STAIR.zFoot + 0.1)).toBeNull();
    expect(at(1.5, STAIR.zHead - 0.1)).toBeNull();
    expect(at(1.5, 8, STAIR.x + STAIR.width / 2 + 0.1)).toBeNull();
    expect(at(-0.1, 8)).toBeNull();
    expect(at(3.1, 8)).toBeNull();
  });
});
