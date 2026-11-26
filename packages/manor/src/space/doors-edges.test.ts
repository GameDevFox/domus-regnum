import { describe, expect, it } from "vitest";

import { doorOf, doorsOn, inTheWay, leavesOf, leavesToRound, underLeaves } from "./doors";
import type { Door, Swing } from "./doors";
import { straightRoute } from "./route";
import { createWalker } from "./walker";

// The doors at their edges: a way that goes through at a doorway's very jamb, who is in the way of a leaf, and which doors are gone round.

/** A door in a wall that runs north and south at x = 2, its doorway from z = -0.5 to 0.5, on the ground, one leaf hung from the north end. */
const DOOR: Door = doorOf({ kind: "door", floor: "ground", axis: "z", at: 2, pos: 0, width: 1 }, 0);
const line = (from: [number, number], to: [number, number]) => straightRoute([{ x: from[0], y: 0, z: from[1] }, { x: to[0], y: 0, z: to[1] }]);
const standing = (x: number, z: number) => createWalker({ x, y: 0, z });
/** A door open to the east, as far as it goes. */
const OPEN_EAST: Swing = { open: 1, side: 1 };

describe("a door's leaves", () => {
  it("are one for a doorway up to a width, and two for a wider", () => {
    const of = (width: number) => leavesOf(doorOf({ kind: "door", floor: "ground", axis: "z", at: 2, pos: 0, width }, 0));
    expect(of(1.2)).toEqual({ count: 1, reach: 1.2 });
    expect(of(1.4)).toEqual({ count: 2, reach: 0.7 });
  });
});

describe("a way through a doorway", () => {
  it("is through it at the very jamb, and not through the wall a little beyond", () => {
    expect(doorsOn([DOOR], line([1, 0.5], [3, 0.5]))).toEqual([{ door: DOOR, side: 1 }]);
    expect(doorsOn([DOOR], line([1, 0.6], [3, 0.6]))).toEqual([]);
    expect(doorsOn([DOOR], line([3, -0.5], [1, -0.5]))).toEqual([{ door: DOOR, side: -1 }]);
  });
});

describe("someone in the way of a door that stands open", () => {
  it("is anyone in the doorway, a little behind it on the side it does not open to, or a little to either side of it", () => {
    expect(inTheWay(DOOR, OPEN_EAST, standing(2, 0))).toBe(true);
    expect(inTheWay(DOOR, OPEN_EAST, standing(1.9, 0))).toBe(true);
    expect(inTheWay(DOOR, OPEN_EAST, standing(2.5, 0.7))).toBe(true);
    expect(inTheWay(DOOR, OPEN_EAST, standing(2.5, -0.7))).toBe(true);
  });

  it("is nobody well behind it, well to the side, or beyond the reach of its leaf", () => {
    expect(inTheWay(DOOR, OPEN_EAST, standing(1.5, 0))).toBe(false);
    expect(inTheWay(DOOR, OPEN_EAST, standing(2.5, 1))).toBe(false);
    expect(inTheWay(DOOR, OPEN_EAST, standing(3.5, 0))).toBe(false);
  });
});

describe("where an open leaf stands", () => {
  it("is out from the wall, and not in the doorway itself; and as near as a body's width to its hinge, the edge counting", () => {
    // (The hinge is at the north end of the doorway, z = -0.5.)
    expect(underLeaves(DOOR, 1, 2, -0.5)).toBe(false);
    expect(underLeaves(DOOR, 1, 2.5, -0.5)).toBe(true);
    expect(underLeaves(DOOR, 1, 2.5, -0.25)).toBe(true);
    expect(underLeaves(DOOR, 1, 2.5, -0.2)).toBe(false);
    expect(underLeaves(DOOR, 1, 2.5, 0)).toBe(false);
  });
});

describe("the ground to be gone round", () => {
  it("includes a door standing open as far from where she sets out as it is gone round from, edge and all, and not one farther", () => {
    const away = line([2, 3], [2, 6]);
    expect(leavesToRound([DOOR], [{ open: 0.5, side: 1 }], away, { x: 2, z: 3 })).not.toBeNull();
    expect(leavesToRound([DOOR], [{ open: 0.5, side: 1 }], away, { x: 2, z: 3.1 })).toBeNull();
  });

  it("keeps a door standing open to the side it opened to, whichever way she goes through it", () => {
    const west = line([3, 0], [1, 0]);
    const bar = leavesToRound([DOOR], [{ open: 0.5, side: 1 }], west, { x: 3, z: 0 });
    expect(bar?.("ground", 2.5, -0.5)).toBe(true);
    expect(bar?.("ground", 1.5, -0.5)).toBe(false);
  });

  it("is where the leaf of a door she is going through will stand, if it is shut now, and nothing at all if she goes through none", () => {
    const bar = leavesToRound([DOOR], [{ open: 0, side: 1 }], line([3, 0], [1, 0]), { x: 3, z: 0 });
    expect(bar?.("ground", 1.5, -0.5)).toBe(true);
    expect(leavesToRound([DOOR], [{ open: 0, side: 1 }], line([3, 2], [1, 2]), { x: 3, z: 2 })).toBeNull();
  });
});
