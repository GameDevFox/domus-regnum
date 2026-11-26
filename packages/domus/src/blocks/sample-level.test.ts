import { describe, expect, it } from "vitest";

import { Dir } from "./grid";
import { ViewSide } from "./properties";
import { manorLevel } from "./sample-level";
import { GridPlacement, isGridPlacement } from "./types";

// The sample buildings use ODD cell dimensions and are centered with `centerLevel`, so the building's
// middle is a node on the world origin — which is what lets every door be a single-cell opening
// centered on a node (rather than straddling the boundary between two). These guard that property.
describe("manor centering", () => {
  const cells = manorLevel.placements
    .filter((p) => isGridPlacement(p) && p.block === "floor" && !p.edge)
    .map((p) => (p as { cell: [number, number] }).cell);
  const cols = cells.map((c) => c[0]);
  const rows = cells.map((c) => c[1]);

  it("centers the floor on the origin node (symmetric extents)", () => {
    expect(Math.min(...cols)).toBe(-Math.max(...cols));
    expect(Math.min(...rows)).toBe(-Math.max(...rows));
  });

  it("puts the front door on the central axis (a doorway at col 0)", () => {
    const centralDoors = manorLevel.placements.filter(
      (p) => isGridPlacement(p) && p.block === "doorway" && p.cell[0] === 0,
    );
    expect(centralDoors.length).toBeGreaterThan(0); // front door (and the gallery door) on the axis
  });

  it("makes every doorway the same single-cell width", () => {
    const doors = manorLevel.placements.filter(
      (p): p is GridPlacement => isGridPlacement(p) && p.block === "doorway",
    );
    expect(doors.length).toBeGreaterThan(0);
    expect(doors.every((p) => (p.span ?? 1) === 1)).toBe(true);
  });

  it("widens each span-1 doorway and trims its flanking walls (so it reads as a real door)", () => {
    const doors = manorLevel.placements.filter(
      (p): p is GridPlacement => isGridPlacement(p) && p.block === "doorway",
    );
    // every nav-centered doorway carries the `wide` flag…
    expect(doors.every((p) => p.params?.wide === true)).toBe(true);
    // …and at least as many trimmed wall ends as there are door sides to flank.
    const trimmedWalls = manorLevel.placements.filter(
      (p) => isGridPlacement(p) && p.block === "wall" && (p.params?.doorStart || p.params?.doorEnd),
    );
    expect(trimmedWalls.length).toBeGreaterThanOrEqual(doors.length);
  });
});

describe("manor exterior walls face out (one-sided)", () => {
  const edges = manorLevel.placements.filter(
    (p): p is GridPlacement => isGridPlacement(p) && !!p.edge,
  );
  const flagged = edges.filter((p) => p.params?.viewSide !== undefined);

  it("flags exterior edge blocks visible only from the interior, by edge orientation", () => {
    // viewSide is relative to the block's local +Z normal: N/S walls face south (+Z), E/W face east
    // (+X). "Visible from the interior" is therefore `front` on the north & west, `back` on south & east.
    const expected: Record<Dir, ViewSide> = { N: "front", W: "front", S: "back", E: "back" };
    expect(flagged.length).toBeGreaterThan(0);
    for (const p of flagged) expect(p.params?.viewSide).toBe(expected[p.edge!]);
  });

  it("leaves interior partitions double-sided (no viewSide)", () => {
    // the hall↔wing wall and the room dividers aren't part of the shell, so they keep both sides
    expect(edges.some((p) => p.params?.viewSide === undefined)).toBe(true);
  });
});
