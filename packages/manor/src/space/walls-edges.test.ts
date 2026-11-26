import { describe, expect, it } from "vitest";

import type { Opening } from "./types";
import { inRect, solidSpans } from "./walls";
import type { Wall } from "./walls";

// Walls at their edges: a doorway at the very end of a wall, doorways given in no order, and a point on the line of a room's edge.

const door = (pos: number, width: number): Opening => ({ kind: "door", floor: "ground", axis: "x", at: 0, pos, width });
const wall = (openings: Opening[]): Wall => ({ floor: "ground", axis: "x", at: 0, from: 0, to: 10, low: "a", high: "b", openings });

describe("the solid stretches of a wall", () => {
  it("are the whole of a wall with no doorway in it", () => {
    expect(solidSpans(wall([]))).toEqual([[0, 10]]);
  });

  it("are one either side of a doorway in the middle of it", () => {
    expect(solidSpans(wall([door(5, 2)]))).toEqual([[0, 4], [6, 10]]);
  });

  it("have no sliver where a doorway begins at the very start of the wall, or ends at its very end", () => {
    expect(solidSpans(wall([door(1, 2)]))).toEqual([[2, 10]]);
    expect(solidSpans(wall([door(9, 2)]))).toEqual([[0, 8]]);
  });

  it("are the same whichever order the doorways are given in, and a window does not cut them", () => {
    const first = door(2, 1);
    const second = door(7, 1);
    const window: Opening = { kind: "window", floor: "ground", axis: "x", at: 0, pos: 4.5, width: 1 };
    const expected = [[0, 1.5], [2.5, 6.5], [7.5, 10]];
    expect(solidSpans(wall([first, second]))).toEqual(expected);
    expect(solidSpans(wall([second, first]))).toEqual(expected);
    expect(solidSpans(wall([second, window, first]))).toEqual(expected);
  });
});

describe("a point in a rectangle", () => {
  const rect = { x: 2, z: 3, w: 4, d: 5 };

  it("is in it on every edge, and out of it a little beyond each", () => {
    expect(inRect(rect, 2, 4)).toBe(true);
    expect(inRect(rect, 6, 4)).toBe(true);
    expect(inRect(rect, 4, 3)).toBe(true);
    expect(inRect(rect, 4, 8)).toBe(true);
    expect(inRect(rect, 1.9, 4)).toBe(false);
    expect(inRect(rect, 6.1, 4)).toBe(false);
    expect(inRect(rect, 4, 2.9)).toBe(false);
    expect(inRect(rect, 4, 8.1)).toBe(false);
  });

  it("is in it a margin beyond its edges, if one is allowed", () => {
    expect(inRect(rect, 1.5, 4, 0.5)).toBe(true);
    expect(inRect(rect, 4, 8.5, 0.5)).toBe(true);
    expect(inRect(rect, 1.4, 4, 0.5)).toBe(false);
  });
});
