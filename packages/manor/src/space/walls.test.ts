import { describe, expect, it } from "vitest";

import { HOUSE } from "./house-plan";
import { deriveWalls, drawnSpan } from "./walls";
import type { Wall } from "./walls";

// Where walls meet, as they are drawn: each is a box, and at a junction one line runs on through
// and whatever ends there butts against it. A wall can drop by itself (the view cuts whichever is
// in the way), so nothing may be left holding a junction closed but the walls of the line itself.

const THICK = 0.2;
const walls = deriveWalls(HOUSE);
const onFloor = (floor: string): Wall[] => walls.filter((w) => w.floor === floor);
const span = (wall: Wall): { from: number; to: number } => drawnSpan(wall, onFloor(wall.floor), THICK);
const find = (floor: string, axis: string, at: number, from: number, to: number): Wall => {
  const wall = walls.find((w) => w.floor === floor && w.axis === axis && w.at === at && w.from === from && w.to === to);
  if (!wall) throw new Error(`no wall ${floor} ${axis}=${at} ${from}-${to}`);
  return wall;
};

describe("walls where they meet", () => {
  // The author's fault: the dormitory seen through the bath, with the wall between them cut down,
  // showed the garden through a slot in the outside wall.
  it("two walls of one line touch where a wall across them only ends: the dormitory's outside wall and the bath's", () => {
    const dormitory = find("first", "z", 2, 1, 7);
    const bath = find("first", "z", 2, 7, 12);
    expect(span(dormitory).to).toBe(7);
    expect(span(bath).from).toBe(7);
    // The same on the landing's side.
    expect(span(find("first", "z", 8, 1, 7)).to).toBe(7);
    expect(span(find("first", "z", 8, 7, 12)).from).toBe(7);
  });

  it("the wall that ends there stops short at both ends, and butts against them", () => {
    const between = span(find("first", "x", 7, 2, 8));
    expect(between.from).toBeCloseTo(2 + THICK / 2, 9);
    expect(between.to).toBeCloseTo(8 - THICK / 2, 9);
  });

  it("at a plain corner the wall along X still runs out to the corner, and the wall along Z stops short of it", () => {
    // The dining room's north-east corner, on the ground floor.
    const north = span(find("ground", "x", 0, 12, 19));
    const east = span(find("ground", "z", 19, 0, 6));
    expect(north.to).toBeCloseTo(19 + THICK / 2, 9);
    expect(east.from).toBeCloseTo(THICK / 2, 9);
  });

  it("nowhere in the house do two walls of one line stop short of each other with nothing running through between them", () => {
    let junctions = 0;
    for (const a of walls) {
      for (const b of walls) {
        if (a === b || a.floor !== b.floor || a.axis !== b.axis || a.at !== b.at || a.to !== b.from) continue;
        junctions += 1;
        const gap = span(b).from - span(a).to;
        if (gap < 1e-9) continue;
        // A gap is allowed only where a line across runs on through it: then that line fills it.
        const across = onFloor(a.floor).filter((o) => o.axis !== a.axis && o.at === a.to);
        const through = across.some((o) => o.from < a.at && a.at < o.to) || (across.some((o) => o.to === a.at) && across.some((o) => o.from === a.at));
        expect(through, `${a.floor} ${a.axis}=${a.at} at ${a.to}: a gap of ${gap.toFixed(2)} with nothing through it`).toBe(true);
      }
    }
    expect(junctions).toBeGreaterThan(10);
  });

  it("where two lines cross and both run on, the one along X has the crossing and the one along Z stops either side of it", () => {
    // Four rooms in a square: their walls cross in the middle. This house has no such crossing; the next may.
    const room = (id: string, x: number, z: number) => ({ id, name: id, floor: "ground" as const, rect: { x, z, w: 4, d: 4 }, flooring: "board", paper: "cream" });
    const four = deriveWalls({ ...HOUSE, rooms: [room("nw", 0, 0), room("ne", 4, 0), room("sw", 0, 4), room("se", 4, 4)], openings: [] });
    const at = (axis: string, from: number): { from: number; to: number } => {
      const wall = four.find((w) => w.floor === "ground" && w.axis === axis && w.at === 4 && w.from === from);
      if (!wall) throw new Error(`no ${axis} wall from ${from}`);
      return drawnSpan(wall, four, THICK);
    };
    expect([at("x", 0).to, at("x", 4).from]).toEqual([4, 4]);
    expect(at("z", 0).to).toBeCloseTo(4 - THICK / 2, 9);
    expect(at("z", 4).from).toBeCloseTo(4 + THICK / 2, 9);
  });

  it("no wall is drawn longer than its line allows: never past the outer face of the wall it meets", () => {
    for (const wall of walls) {
      const { from, to } = span(wall);
      expect(from).toBeGreaterThanOrEqual(wall.from - THICK / 2 - 1e-9);
      expect(to).toBeLessThanOrEqual(wall.to + THICK / 2 + 1e-9);
      expect(to).toBeGreaterThan(from);
    }
  });
});
