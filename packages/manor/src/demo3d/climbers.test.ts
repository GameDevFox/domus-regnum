import { describe, expect, it } from "vitest";

import { HOUSE, deriveWalls } from "../space";
import type { Wall } from "../space";
import { CLIMBERS, sprigsOf, sprigsOn } from "./climbers";
import type { Box, Climber } from "./climbers";

// (shell.ts's own measures, which it hands over: a wall cut at 0.9 m, 0.2 m thick, on a slab of 0.3 m; a door 2.1 m high and a window's head at 2.3 m; the lawn 0.3 m under the ground floor.)
const M = { ground: -0.3, cut: 0.9, thick: 0.2, slab: 0.3, doorHead: 2.1, windowHead: 2.3 };
const WALLS = deriveWalls(HOUSE);
const STANDING = { storeys: HOUSE.storeys, walls: WALLS };
const on = (wall: Wall, climbers?: Climber[]): { lower: Box[]; upper: Box[] } => sprigsOn(wall, STANDING, M, climbers);
const wallAt = (floor: string, axis: string, at: number, from: number): Wall => {
  const found = WALLS.find((w) => w.floor === floor && w.axis === axis && w.at === at && w.from === from);
  if (!found) throw new Error(`no wall ${floor} ${axis} ${at} from ${from}`);
  return found;
};
/** A box's span along the wall and its height in the world, whichever part of the wall it is of. */
const spanOf = (wall: Wall, box: Box, part: "lower" | "upper"): { a: number; b: number; from: number; to: number } => {
  const foot = HOUSE.storeys[wall.floor].y + (part === "upper" ? M.cut : 0);
  return { a: box.x - box.w / 2, b: box.x + box.w / 2, from: foot + box.y - box.h / 2, to: foot + box.y + box.h / 2 };
};

describe("the climbers on the house", () => {
  it("each one that is planted grows on some wall of the house", () => {
    for (const climber of CLIMBERS) {
      const boxes = WALLS.flatMap((wall) => [...on(wall, [climber]).lower, ...on(wall, [climber]).upper]);
      expect(boxes.length, `${climber.kind} at ${climber.axis} ${climber.at}`).toBeGreaterThan(10);
    }
  });

  it("only an outside wall grows anything", () => {
    const inside = WALLS.filter((w) => w.low !== null && w.high !== null);
    // (A climber planted on the line of each inside wall, so that it is the wall and not the planting that says no.)
    for (const wall of inside) expect(on(wall, [{ kind: "ivy", axis: wall.axis, at: wall.at, pos: (wall.from + wall.to) / 2, wide: 2, tall: 3 }])).toEqual({ lower: [], upper: [] });
    expect(inside.length).toBeGreaterThan(0);
  });

  it("what is under the rail is of the wall's lower part, and what is over it of its upper: nothing crosses", () => {
    for (const wall of WALLS) {
      const { y, height } = HOUSE.storeys[wall.floor];
      for (const box of on(wall).lower) expect(spanOf(wall, box, "lower").to).toBeLessThanOrEqual(y + M.cut + 1e-9);
      for (const box of on(wall).lower) expect(spanOf(wall, box, "lower").from).toBeGreaterThanOrEqual(y - M.slab - 1e-9);
      for (const box of on(wall).upper) expect(spanOf(wall, box, "upper").from).toBeGreaterThanOrEqual(y + M.cut - 1e-9);
      for (const box of on(wall).upper) expect(spanOf(wall, box, "upper").to).toBeLessThanOrEqual(y + height + 1e-9);
    }
  });

  it("it is on the garden side of its wall, and within the wall's length", () => {
    // The front of the parlour looks south, the high side of a wall along X, which is +Z in its own frame; the west gable looks to the low side of a wall along Z, which is +Z in its own frame too.
    // The east end of the dining room looks to the high side of a wall along Z, and the back of the house to the low side of one along X: both -Z.
    const sides: [Wall, 1 | -1][] = [[wallAt("ground", "x", 12, 12), 1], [wallAt("ground", "z", 2, 7), 1], [wallAt("ground", "z", 19, 0), -1], [wallAt("ground", "x", 1, 8), -1]];
    for (const [wall, side] of sides) {
      const boxes = [...on(wall).lower, ...on(wall).upper];
      expect(boxes.length).toBeGreaterThan(0);
      for (const box of boxes) {
        expect(Math.sign(box.z)).toBe(side);
        expect(Math.abs(box.z) - box.d / 2).toBeCloseTo(M.thick / 2);
        expect(box.x - box.w / 2).toBeGreaterThanOrEqual(wall.from - 1e-9);
        expect(box.x + box.w / 2).toBeLessThanOrEqual(wall.to + 1e-9);
      }
    }
  });

  it("a planting that runs past the end of its wall is cut off there, and one on another wall's line is not on this one at all", () => {
    // The west gable downstairs runs from 7 to 12.
    const wall = wallAt("ground", "z", 2, 7);
    const past = [...on(wall, [{ kind: "ivy", axis: "z", at: 2, pos: 12, wide: 4, tall: 2 }]).lower];
    expect(past.length).toBeGreaterThan(0);
    for (const box of past) expect(box.x + box.w / 2).toBeLessThanOrEqual(12 + 1e-9);
    expect(past.some((box) => Math.abs(box.x + box.w / 2 - 12) < 1e-9)).toBe(true);
    expect(on(wall, [{ kind: "ivy", axis: "z", at: 18, pos: 9, wide: 4, tall: 2 }])).toEqual({ lower: [], upper: [] });
    expect(on(wall, [{ kind: "ivy", axis: "x", at: 2, pos: 9, wide: 4, tall: 2 }])).toEqual({ lower: [], upper: [] });
  });

  it("ivy is over no window, and nowhere above one: the bathroom's is clear, and so is the wall over it", () => {
    // The west gable upstairs: the bathroom's window is 1.25 m wide at 9.5, from the rail to 2.3 m.
    const wall = wallAt("first", "z", 2, 7);
    const sill = HOUSE.storeys.first.y + M.cut;
    const boxes = [...on(wall).lower.map((b) => spanOf(wall, b, "lower")), ...on(wall).upper.map((b) => spanOf(wall, b, "upper"))];
    expect(boxes.filter((b) => b.to > sill).length).toBeGreaterThan(0);
    for (const box of boxes) if (box.b > 9.5 - 0.625 && box.a < 9.5 + 0.625) expect(box.to).toBeLessThanOrEqual(sill);
    // …and there is ivy under it, between the floor and the sill, which has come up from the ground.
    expect(boxes.some((b) => b.a < 9.5 && b.b > 9.5 && b.from >= HOUSE.storeys.first.y && b.to <= sill)).toBe(true);
  });

  it("…nor above a window of the storey below: over the dining room's windows the wall upstairs is bare", () => {
    // The east end: the dining room's windows are at 1.25 and 4.75; the study's, upstairs, is at 3.
    const wall = wallAt("first", "z", 19, 0);
    const boxes = [...on(wall).lower.map((b) => spanOf(wall, b, "lower")), ...on(wall).upper.map((b) => spanOf(wall, b, "upper"))];
    expect(boxes.length).toBeGreaterThan(0);
    for (const box of boxes) for (const pos of [1.25, 4.75]) expect(box.b <= pos - 0.625 || box.a >= pos + 0.625).toBe(true);
  });

  it("wisteria's leaves are over the parlour's windows, where it is trained, and its flowers hang before them", () => {
    const wall = wallAt("ground", "x", 12, 12);
    const head = M.windowHead;
    const over = on(wall).upper.map((b) => spanOf(wall, b, "upper")).filter((b) => b.b > 13.5 - 0.5 && b.a < 13.5 + 0.5);
    // (More than the one branch they hang from: leaves, several of them.)
    expect(over.filter((b) => b.from >= head).length).toBeGreaterThan(3);
    expect(over.some((b) => b.from < head && b.to <= head + 0.3)).toBe(true);
    // Its trunk is cut with the wall: a length of it under the rail, the rest over.
    expect(on(wall).lower.length).toBeGreaterThan(0);
  });

  it("a plant is the same plant every time", () => {
    for (const climber of CLIMBERS) expect(sprigsOf(climber, M.ground)).toEqual(sprigsOf(climber, M.ground));
    const ivy = CLIMBERS.filter((c) => c.kind === "ivy");
    // …and two of a kind are not the same as each other.
    expect(sprigsOf(ivy[0], 0).map((s) => s.color).join()).not.toBe(sprigsOf({ ...ivy[0], at: ivy[0].at + 1 }, 0).map((s) => s.color).join());
  });
});
