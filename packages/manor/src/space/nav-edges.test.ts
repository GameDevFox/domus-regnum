import { describe, expect, it } from "vitest";

import { HOUSE } from "./house-plan";
import { CELL, STAIR_COST, findCells, stairEnds } from "./nav";
import { nav, spot } from "./space-kit";
import { riseOf } from "./stairs";

// The floor people walk on, at its edges: two points in one square, how dear a stair is, and a point halfway between two squares.

describe("the cells walked through", () => {
  it("are the one cell, once, for two points in the same square of the floor", () => {
    const near = spot("kitchen.table.n");
    const middle = nav.cell(nav.nearest(near) ?? -1);
    const from = { floor: near.floor, x: middle.x, z: middle.z };
    const cells = findCells(nav, from, { ...from, x: middle.x + CELL / 10 });
    expect(cells).toHaveLength(1);
  });
});

describe("a step across the corner of two squares", () => {
  it("is only taken when both squares beside it are floor: nobody cuts a corner", () => {
    let diagonals = 0;
    nav.graph.forEachNode((node) => {
      const { floor, x, z } = node.data;
      // (Each square's four neighbours are told apart by where their centres are, not by their numbers.)
      const floorAt = (dx: number, dz: number): boolean => {
        const there = nav.graph.getNode(Number(node.id) + dz * nav.cols + dx);
        return there !== undefined && there.data.floor === floor && Math.abs(there.data.x - (x + dx * CELL)) < 1e-9 && Math.abs(there.data.z - (z + dz * CELL)) < 1e-9;
      };
      const joined = (dx: number, dz: number): boolean => Boolean(nav.graph.getLink(node.id, Number(node.id) + dz * nav.cols + dx));
      for (const dx of [-1, 1]) {
        if (!floorAt(dx, 1) || !joined(dx, 1)) continue;
        diagonals++;
        expect(floorAt(dx, 0) && floorAt(0, 1), `${floor} ${x},${z}`).toBe(true);
      }
    });
    expect(diagonals).toBeGreaterThan(100);
  });
});

describe("a flight of stairs in the graph", () => {
  it("costs more than the length of the climb, which is dearer than a walk of the same length on the flat", () => {
    expect(HOUSE.stairs.length).toBeGreaterThan(0);
    for (const stair of HOUSE.stairs) {
      const ends = stairEnds(stair);
      const foot = nav.nearest(ends.foot);
      const head = nav.nearest(ends.head);
      if (foot === null || head === null) throw new Error(`the ${stair.id} stair has no ends`);
      const link = nav.graph.getLink(foot, head) ?? nav.graph.getLink(head, foot);
      const climb = Math.hypot(stair.zFoot - stair.zHead, riseOf(HOUSE, stair));
      expect(link?.data, stair.id).toBeGreaterThan(climb * STAIR_COST);
    }
  });
});

describe("the nearest floor to a point", () => {
  it("is the first of two squares when the point is halfway between them", () => {
    let found = false;
    nav.graph.forEachNode((node) => {
      const { floor, x, z } = node.data;
      if (found || !nav.walkable(floor, x + CELL, z)) return;
      found = true;
      expect(nav.nearest({ floor, x: x + CELL / 2, z })).toBe(node.id);
    });
    expect(found).toBe(true);
  });
});
