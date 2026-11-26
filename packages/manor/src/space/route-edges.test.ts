import { describe, expect, it } from "vitest";

import { findRoute, pointAlong, straightRoute } from "./route";
import { nav, spot } from "./space-kit";

// Where someone is along a route, at its edges: before its start, past its end, at a corner, and on a stretch with no length.

/** South five metres, then east five: a corner at the fifth metre. */
const CORNERED = straightRoute([{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 5 }, { x: 5, y: 0, z: 5 }]);
const SOUTH = 0;
const EAST = Math.PI / 2;

describe("a route across the open floor of a room", () => {
  it("is a straight line from exactly where she is to exactly where she is going: two points, with nothing between", () => {
    const from = spot("kitchen.table.w");
    const to = spot("kitchen.hatch");
    const route = findRoute(nav, from, to);
    expect(route?.points).toHaveLength(2);
    expect(route?.points[0]).toEqual({ x: from.x, y: 0, z: from.z });
    expect(route?.points[1]).toEqual({ x: to.x, y: 0, z: to.z });
    expect(route?.length).toBeCloseTo(Math.hypot(to.x - from.x, to.z - from.z));
  });
});

describe("a point along a route", () => {
  it("is where it is by the metre, and heads the way of the stretch it is on", () => {
    const early = pointAlong(CORNERED, 2);
    expect([early.pos.x, early.pos.z, early.heading]).toEqual([0, 2, SOUTH]);
    const late = pointAlong(CORNERED, 7);
    expect([late.pos.x, late.pos.z, late.heading]).toEqual([2, 5, EAST]);
  });

  it("is at the corner, still heading the way it came to it, at the very metre of the corner", () => {
    const corner = pointAlong(CORNERED, 5);
    expect([corner.pos.x, corner.pos.z, corner.heading]).toEqual([0, 5, SOUTH]);
  });

  it("is at the start before the start, and at the end past the end", () => {
    expect(pointAlong(CORNERED, -3).pos).toEqual({ x: 0, y: 0, z: 0 });
    expect(pointAlong(CORNERED, 100).pos).toEqual({ x: 5, y: 0, z: 5 });
  });

  it("is where the stretch is, whole, for a stretch with no length", () => {
    const stood = straightRoute([{ x: 1, y: 0, z: 1 }, { x: 1, y: 0, z: 1 }]);
    expect(pointAlong(stood, 0).pos).toEqual({ x: 1, y: 0, z: 1 });
  });
});
