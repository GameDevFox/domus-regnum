import { describe, expect, it } from "vitest";

import { r90 } from "@kitsune/common";

import { floorRect, room } from "./author";
import {
  addWallCorners,
  centerLevel,
  deserializeLevel,
  eraseBlockAtCell,
  eraseCell,
  eraseEdge,
  findPlacementAt,
  movePlacement,
  placeBlock,
  placementCoversCell,
  placeRegion,
  regionRect,
  removePlacement,
  rotatePlacement,
  serializeLevel,
  setPlacementElevation,
  setPlacementParam,
  setRegionRect,
} from "./edit";
import { manorLevel } from "./sample-level";
import { FreePlacement, GridPlacement, isGridPlacement, Level, Placement } from "./types";

const empty = (): Level => ({ name: "test", tile: 1, placements: [] });

describe("level edit ops", () => {
  it("replaces an existing floor when placing a floor on the same cell", () => {
    let lvl = placeBlock(empty(), { block: "floor", cell: [0, 0], params: { color: 1 } });
    lvl = placeBlock(lvl, { block: "floor", cell: [0, 0], params: { color: 2 } });
    expect(lvl.placements).toHaveLength(1);
    expect((lvl.placements[0].params as { color: number }).color).toBe(2);
  });

  it("keeps a floor at a different elevation on the same cell (stacked floors)", () => {
    let lvl = placeBlock(empty(), { block: "floor", cell: [0, 0] }); // ground (y = 0)
    lvl = placeBlock(lvl, { block: "floor", cell: [0, 0], y: 3.3 }); // upstairs, same cell
    expect(lvl.placements).toHaveLength(2); // both survive — the upper one didn't evict the lower
    lvl = placeBlock(lvl, { block: "floor", cell: [0, 0], y: 3.3, params: { color: 9 } }); // re-place upstairs
    expect(lvl.placements).toHaveLength(2); // same elevation ⇒ overwrites, no stack
    expect((lvl.placements[1].params as { color: number }).color).toBe(9);
  });

  it("treats walls and doorways as mutually exclusive on the same edge", () => {
    let lvl = placeBlock(empty(), { block: "wall", cell: [0, 0], edge: "E" });
    // Same physical edge, named from the other side -> replaces the wall.
    lvl = placeBlock(lvl, { block: "doorway", cell: [1, 0], edge: "W" });
    expect(lvl.placements).toHaveLength(1);
    expect(lvl.placements[0].block).toBe("doorway");
  });

  it("lets different block kinds share a cell, but not duplicate the same kind", () => {
    let lvl = placeBlock(empty(), { block: "floor", cell: [2, 2] });
    lvl = placeBlock(lvl, { block: "chair", cell: [2, 2] });
    expect(lvl.placements).toHaveLength(2); // floor + chair coexist
    lvl = placeBlock(lvl, { block: "chair", cell: [2, 2] });
    expect(lvl.placements).toHaveLength(2); // re-placing the chair overwrites, no stack
  });

  it("always appends free placements", () => {
    let lvl = placeBlock(empty(), { block: "lamp", pos: [1, 0, 1] });
    lvl = placeBlock(lvl, { block: "lamp", pos: [1, 0, 1] });
    expect(lvl.placements).toHaveLength(2);
  });

  it("erases all grid blocks on a cell but leaves edges", () => {
    let lvl = placeBlock(empty(), { block: "floor", cell: [0, 0] });
    lvl = placeBlock(lvl, { block: "chair", cell: [0, 0] });
    lvl = placeBlock(lvl, { block: "wall", cell: [0, 0], edge: "N" });
    lvl = eraseCell(lvl, [0, 0]);
    expect(lvl.placements).toHaveLength(1);
    expect(lvl.placements[0].block).toBe("wall"); // the edge survives
  });

  it("erases a single block kind from a cell", () => {
    let lvl = placeBlock(empty(), { block: "floor", cell: [0, 0] });
    lvl = placeBlock(lvl, { block: "chair", cell: [0, 0] });
    lvl = eraseBlockAtCell(lvl, [0, 0], "chair");
    expect(lvl.placements.map((p) => p.block)).toEqual(["floor"]);
  });

  it("erases an edge block from either side", () => {
    let lvl = placeBlock(empty(), { block: "wall", cell: [0, 0], edge: "E" });
    lvl = eraseEdge(lvl, [1, 0], "W"); // same edge, other side
    expect(lvl.placements).toHaveLength(0);
  });

  it("erases a spanning edge block from any cell it covers, not just its anchor", () => {
    // A 2-cell doorway anchored on the N edge of [0,0] also covers the N edge of [1,0].
    let lvl = placeBlock(empty(), { block: "doorway", cell: [0, 0], edge: "N", span: 2 });
    const fromSecond = eraseEdge(lvl, [1, 0], "N"); // click the far cell of the span
    expect(fromSecond.placements).toHaveLength(0);
    lvl = eraseEdge(lvl, [0, 0], "N"); // and the anchor still works
    expect(lvl.placements).toHaveLength(0);
  });

  it("round-trips a level through serialize/deserialize", () => {
    const json = serializeLevel(manorLevel);
    const back = deserializeLevel(json);
    expect(back).toEqual(manorLevel);
  });

  it("rejects malformed level JSON", () => {
    expect(() => deserializeLevel('{"foo":1}')).toThrow();
  });

  it("selects the topmost prop over the floor on a shared cell, and excludes walls", () => {
    let lvl = placeBlock(empty(), { block: "floor", cell: [3, 3] });
    lvl = placeBlock(lvl, { block: "wall", cell: [3, 3], edge: "N" });
    lvl = placeBlock(lvl, { block: "chair", cell: [3, 3] });
    const i = findPlacementAt(lvl, [3, 3]);
    expect(lvl.placements[i].block).toBe("chair"); // prop beats floor, wall is not cell-selectable
    expect(findPlacementAt(lvl, [9, 9])).toBe(-1); // nothing there
  });

  it("finds a free placement by the cell its world position maps to", () => {
    const lvl: Level = { name: "t", tile: 0.5, placements: [{ block: "lamp", pos: [1, 0, 1.5] }] };
    expect(findPlacementAt(lvl, [2, 3])).toBe(0); // 1/0.5=2, 1.5/0.5=3
  });

  it("placementCoversCell spans a region floor's whole rectangle, only the cell otherwise", () => {
    const region: Placement = { block: "floor", cell: [1, 1], size: [3, 2] }; // cells (1..3, 1..2)
    expect(placementCoversCell(region, [1, 1], 1)).toBe(true); // anchor
    expect(placementCoversCell(region, [3, 2], 1)).toBe(true); // far corner
    expect(placementCoversCell(region, [4, 1], 1)).toBe(false); // just past the east edge
    const single: Placement = { block: "floor", cell: [2, 2] };
    expect(placementCoversCell(single, [2, 2], 1)).toBe(true);
    expect(placementCoversCell(single, [3, 2], 1)).toBe(false);
    expect(placementCoversCell({ block: "wall", cell: [0, 0], edge: "N" }, [0, 0], 1)).toBe(false);
  });

  it("findPlacementAt selects a region floor from ANY cell it covers", () => {
    const lvl: Level = {
      name: "t",
      tile: 1,
      placements: [{ block: "floor", cell: [0, 0], size: [4, 3] }],
    };
    expect(findPlacementAt(lvl, [0, 0])).toBe(0);
    expect(findPlacementAt(lvl, [3, 2])).toBe(0); // an interior cell still grabs the whole region
    expect(findPlacementAt(lvl, [4, 0])).toBe(-1); // outside the rect
  });

  it("regionRect normalizes two corner cells into NW anchor + positive size (any drag order)", () => {
    expect(regionRect([5, 4], [2, 1])).toEqual({ cell: [2, 1], size: [4, 4] }); // 2..5, 1..4 inclusive
    expect(regionRect([0, 0], [0, 0])).toEqual({ cell: [0, 0], size: [1, 1] }); // single cell
  });

  it("placeRegion clears overlapping floors then lays one merged region (props survive)", () => {
    let lvl: Level = {
      name: "t",
      tile: 1,
      placements: [
        { block: "floor", cell: [1, 1] }, // single tile INSIDE the new 3×3 region → removed
        { block: "floor", cell: [9, 9] }, // floor OUTSIDE → kept
        { block: "chair", cell: [2, 2] }, // a prop inside → kept (only floors are cleared)
      ],
    };
    lvl = placeRegion(lvl, [0, 0], [3, 3]);
    const floors = lvl.placements.filter((p) => p.block === "floor");
    expect(floors).toHaveLength(2); // the [9,9] tile + the new region (overlapping tile gone)
    expect(floors.some((p) => (p as GridPlacement).size?.[0] === 3)).toBe(true);
    expect(lvl.placements.some((p) => p.block === "chair")).toBe(true);
  });

  it("setRegionRect moves/resizes a region in place, clamped to ≥1×1", () => {
    let lvl: Level = {
      name: "t",
      tile: 1,
      placements: [{ block: "floor", cell: [0, 0], size: [2, 2] }],
    };
    lvl = setRegionRect(lvl, 0, [1, 1], [5, 3]);
    expect(lvl.placements[0]).toMatchObject({ cell: [1, 1], size: [5, 3] });
    lvl = setRegionRect(lvl, 0, [1, 1], [0, -2]); // degenerate drag → clamped
    expect((lvl.placements[0] as { size: [number, number] }).size).toEqual([1, 1]);
    expect(setRegionRect(lvl, 9, [0, 0], [2, 2])).toBe(lvl); // out of range → same value
  });

  it("moves a grid placement to a new cell", () => {
    let lvl = placeBlock(empty(), { block: "chair", cell: [1, 1], face: "N" });
    lvl = movePlacement(lvl, 0, [4, 2]);
    expect((lvl.placements[0] as GridPlacement).cell).toEqual([4, 2]);
    expect((lvl.placements[0] as GridPlacement).face).toBe("N"); // other fields preserved
  });

  it("moves a free placement by the matching world delta, preserving sub-cell offset", () => {
    const lvl: Level = {
      name: "t",
      tile: 0.5,
      placements: [{ block: "lamp", pos: [0.1, 0, 0.1] }],
    };
    const moved = movePlacement(lvl, 0, [2, 0]); // from cell [0,0] to [2,0] => +1.0 on x
    expect((moved.placements[0] as FreePlacement).pos).toEqual([1.1, 0, 0.1]);
  });

  it("rotates a grid prop's facing through the N→E→S→W cycle", () => {
    let lvl = placeBlock(empty(), { block: "chair", cell: [0, 0], face: "N" });
    lvl = rotatePlacement(lvl, 0);
    expect((lvl.placements[0] as GridPlacement).face).toBe("E");
    lvl = rotatePlacement(lvl, 0, 2);
    expect((lvl.placements[0] as GridPlacement).face).toBe("W");
  });

  it("rotates a free placement via rotY", () => {
    const lvl: Level = { name: "t", tile: 1, placements: [{ block: "lamp", pos: [0, 0, 0] }] };
    const turned = rotatePlacement(lvl, 0);
    expect((turned.placements[0] as FreePlacement).rotY).toBeCloseTo(r90);
  });

  it("sets a grid placement's elevation (and omits y when 0), no-op when unchanged", () => {
    let lvl = placeBlock(empty(), { block: "chair", cell: [1, 1], face: "N" });
    lvl = setPlacementElevation(lvl, 0, 3.3);
    expect((lvl.placements[0] as GridPlacement).y).toBe(3.3);
    const back = setPlacementElevation(lvl, 0, 0);
    expect((back.placements[0] as GridPlacement).y).toBeUndefined(); // 0 ⇒ omitted (clean data)
    expect(setPlacementElevation(back, 0, 0)).toBe(back); // already at 0 ⇒ same value
  });

  it("sets a free placement's elevation via pos.y", () => {
    const lvl: Level = { name: "t", tile: 1, placements: [{ block: "lamp", pos: [1, 0, 2] }] };
    const lifted = setPlacementElevation(lvl, 0, 2.5);
    expect((lifted.placements[0] as FreePlacement).pos).toEqual([1, 2.5, 2]);
  });

  it("removes the placement at an index, no-op when out of range", () => {
    let lvl = placeBlock(empty(), { block: "floor", cell: [0, 0] });
    lvl = placeBlock(lvl, { block: "chair", cell: [0, 0] });
    expect(removePlacement(lvl, 0).placements.map((p) => p.block)).toEqual(["chair"]);
    expect(removePlacement(lvl, 9)).toBe(lvl); // out of range → same value
  });

  it("sets, overwrites, and clears a placement param (dropping empty params), no-op out of range", () => {
    let lvl = placeBlock(empty(), { block: "wall", cell: [0, 0], edge: "N" });
    lvl = setPlacementParam(lvl, 0, "viewSide", "front");
    expect(lvl.placements[0].params).toEqual({ viewSide: "front" });
    lvl = setPlacementParam(lvl, 0, "viewSide", "back"); // overwrite
    expect(lvl.placements[0].params).toEqual({ viewSide: "back" });
    lvl = setPlacementParam(lvl, 0, "viewSide", undefined); // clear the only key
    expect(lvl.placements[0].params).toBeUndefined(); // emptied params dropped → clean data
    expect(setPlacementParam(lvl, 9, "viewSide", "front")).toBe(lvl); // out of range → same value
  });

  it("preserves sibling params when setting/clearing one key", () => {
    let lvl = placeBlock(empty(), { block: "wall", cell: [0, 0], edge: "N", params: { color: 7 } });
    lvl = setPlacementParam(lvl, 0, "viewSide", "front");
    expect(lvl.placements[0].params).toEqual({ color: 7, viewSide: "front" });
    lvl = setPlacementParam(lvl, 0, "viewSide", undefined);
    expect(lvl.placements[0].params).toEqual({ color: 7 }); // sibling survives, params not dropped
  });

  it("adds a corner post at each wall junction of a room", () => {
    const lvl: Level = {
      name: "r",
      tile: 1,
      placements: room({ x: 0, y: 0, w: 2, h: 2, wallParams: { thickness: 0.2 } }),
    };
    const corners = addWallCorners(lvl)
      .placements.filter((p) => p.block === "corner")
      .map((p) => (p as FreePlacement).pos.join(","))
      .sort();
    // exactly the four building corners (vertices), not the mid-run edge vertices
    expect(corners).toEqual(["-0.5,0,-0.5", "-0.5,0,1.5", "1.5,0,-0.5", "1.5,0,1.5"].sort());
  });

  it("does not add corners along a straight wall run (collinear, no turn)", () => {
    // A 4×1 floor with a single straight N wall run — every junction is collinear, so no corners.
    const placements = [
      ...floorRect(0, 0, 4, 1),
      ...[0, 1, 2, 3].map((c) => ({
        block: "wall",
        cell: [c, 0] as [number, number],
        edge: "N" as const,
      })),
    ];
    expect(
      addWallCorners({ name: "s", tile: 1, placements }).placements.some(
        (p) => p.block === "corner",
      ),
    ).toBe(false);
  });

  it("stamps each corner with the adjacent walls' viewSides (cullH/cullV)", () => {
    // An N wall and a W wall on the same cell meet at the NW vertex (-0.5,-0.5); the post should carry
    // the horizontal wall's viewSide as cullH and the vertical wall's as cullV (for two-wall culling).
    const placements = [
      {
        block: "wall",
        cell: [0, 0] as [number, number],
        edge: "N" as const,
        params: { viewSide: "front" },
      },
      {
        block: "wall",
        cell: [0, 0] as [number, number],
        edge: "W" as const,
        params: { viewSide: "back" },
      },
    ];
    const corner = addWallCorners({ name: "c", tile: 1, placements }).placements.find(
      (p) => p.block === "corner",
    );
    expect(corner?.params).toMatchObject({ cullH: "front", cullV: "back" });
  });

  it("centers a level's floor footprint on the origin", () => {
    const lvl: Level = { name: "off", tile: 1, placements: floorRect(2, 3, 4, 4) }; // cols 2–5, rows 3–6
    const cells = centerLevel(lvl)
      .placements.filter(isGridPlacement)
      .map((p) => p.cell);
    const xs = cells.map((c) => c[0]);
    const ys = cells.map((c) => c[1]);
    expect(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2)).toBeLessThanOrEqual(0.5);
    expect(Math.abs((Math.min(...ys) + Math.max(...ys)) / 2)).toBeLessThanOrEqual(0.5);
  });
});
