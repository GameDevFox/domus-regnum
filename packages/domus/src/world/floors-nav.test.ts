import { Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { buildTwoFloorNav } from "./floors-nav";

describe("buildTwoFloorNav", () => {
  const cols = 3;
  const rows = 3;
  const height = 2;
  const mesh = buildTwoFloorNav(cols, rows, height, 1);
  const lower = (c: number, r: number) => r * cols + c;
  const upper = (c: number, r: number) => cols * rows + r * cols + c;
  const upLane = (r: number) => 2 * cols * rows + r;

  // A point on a lane's mid-steps (strictly between the floor levels): the up lane sits at x = cols,
  // the down lane one column further out. The landings (y = 0 / y = height) are excluded.
  const midUp = (p: Vector3) => p.x === cols && p.y > 0 && p.y < height;
  const midDown = (p: Vector3) => p.x === cols + 1 && p.y > 0 && p.y < height;

  it("has two floors plus two ramp lanes of nodes", () => {
    expect(mesh.nodes).toHaveLength(2 * cols * rows + 2 * rows);
    expect(mesh.nav.nodeIds).toHaveLength(24);
  });

  it("routes lower -> upper up the up lane (never the down lane), actually climbing", () => {
    const path = mesh.nav.findPath(lower(0, 0), upper(0, 0));
    expect(path.length).toBeGreaterThan(0);
    expect(path[path.length - 1]).toEqual(mesh.nav.positionOf(upper(0, 0)));
    expect(path.some(midUp)).toBe(true);
    expect(path.some(midDown)).toBe(false);
    expect(path.some((p) => p.y === height)).toBe(true);
  });

  it("routes upper -> lower down the down lane, never descending the up lane", () => {
    const path = mesh.nav.findPath(upper(0, 0), lower(0, 0));
    expect(path.length).toBeGreaterThan(0);
    expect(path[path.length - 1]).toEqual(mesh.nav.positionOf(lower(0, 0)));
    expect(path.some(midDown)).toBe(true);
    expect(path.some(midUp)).toBe(false);
  });

  it("lets an agent reverse mid-stair via a rung, without climbing to the top", () => {
    const start = upLane(1); // parked halfway up the up lane
    const startY = mesh.nav.positionOf(start).y;
    const path = mesh.nav.findPath(start, lower(0, 0));
    expect(path.length).toBeGreaterThan(0);
    expect(path[path.length - 1]).toEqual(mesh.nav.positionOf(lower(0, 0)));
    // Crosses to the down lane and descends rather than continuing up: never rises above the start.
    expect(Math.max(...path.map((p) => p.y))).toBeLessThanOrEqual(startY);
    expect(path.some(midDown)).toBe(true);
  });
});
