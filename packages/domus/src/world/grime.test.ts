import { describe, expect, it } from "vitest";

import { buildGridNav } from "./grid-nav";
import { GrimeField } from "./grime";

describe("GrimeField", () => {
  it("starts spotless and accrues grime over time", () => {
    const { nav } = buildGridNav(3, 3);
    const field = GrimeField({ nav, rate: 0.1 });
    expect(field.cleanliness()).toBe(1);

    field.tick(1); // +0.1 everywhere
    expect(field.cleanliness()).toBeCloseTo(0.9, 5);
    expect(field.grimeOf(0)).toBeCloseTo(0.1, 5);
  });

  it("clamps grime to 1 and never reports negative cleanliness", () => {
    const { nav } = buildGridNav(2, 2);
    const field = GrimeField({ nav, rate: 1 });
    field.tick(5); // would be 5, clamps to 1
    expect(field.grimeOf(0)).toBe(1);
    expect(field.cleanliness()).toBe(0);
  });

  it("raises grime locally from foot traffic and clamps", () => {
    const { nav } = buildGridNav(3, 3);
    const field = GrimeField({ nav });
    field.raise(4, 0.3);
    expect(field.grimeOf(4)).toBeCloseTo(0.3, 5);
    field.raise(4, 5);
    expect(field.grimeOf(4)).toBe(1);
  });

  it("cleaning a node (set to 0) restores cleanliness", () => {
    const { nav } = buildGridNav(2, 2);
    const field = GrimeField({ nav, rate: 0.5 });
    field.tick(1); // 0.5 everywhere -> cleanliness 0.5
    expect(field.cleanliness()).toBeCloseTo(0.5, 5);
    nav.nodeIds.forEach((id) => field.setGrime(id, 0));
    expect(field.cleanliness()).toBe(1);
  });

  it("lists the dirtiest nodes above a threshold, grimiest first", () => {
    const { nav } = buildGridNav(3, 1);
    const field = GrimeField({ nav });
    field.setGrime(0, 0.2);
    field.setGrime(1, 0.8);
    field.setGrime(2, 0.5);
    expect(field.dirtiest(0.4)).toEqual([1, 2]); // 0.2 is below threshold
    expect(field.dirtiest()).toEqual([1, 2, 0]); // all, grimiest first
  });
});
