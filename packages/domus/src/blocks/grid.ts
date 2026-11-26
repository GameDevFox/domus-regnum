import { Vector3 } from "three";

import { r90 } from "@kitsune/common";

// Grid math for the building-block system. Pure, no Three side effects beyond constructing
// Vector3s, so it's trivially unit-testable. The convention, fixed here once:
//
//   - The floor is the XZ plane, Y is up.
//   - A cell is [col, row]; col runs +X (east), row runs +Z (south).
//   - `tile` is world units per cell. A cell's CENTER is at (col*tile, 0, row*tile).
//   - Walls/doorways live on cell EDGES (the boundary shared by two cells).
//   - Compass directions: N = -Z, S = +Z, E = +X, W = -X.
//
// Everything downstream (factories, the level interpreter, the navmesh derivation) speaks this
// convention so geometry, placement, and pathfinding all agree.

export type Cell = [number, number]; // [col, row]
export type Dir = "N" | "E" | "S" | "W";

export const DIRS: Dir[] = ["N", "E", "S", "W"];

// Unit step in a direction, in cell space.
const STEP: Record<Dir, Cell> = {
  N: [0, -1],
  E: [1, 0],
  S: [0, 1],
  W: [-1, 0],
};

export const opposite = (dir: Dir): Dir => ({ N: "S", S: "N", E: "W", W: "E" } as const)[dir];

// Rotate a direction by `steps` quarter-turns through the N→E→S→W cycle (clockwise from above).
// Negative steps turn the other way. Used by the editor to rotate a selected block's facing/edge.
export const rotateDir = (dir: Dir, steps = 1): Dir =>
  DIRS[(((DIRS.indexOf(dir) + steps) % 4) + 4) % 4];

// The neighbouring cell one step in `dir`.
export const step = ([c, r]: Cell, dir: Dir): Cell => {
  const [dc, dr] = STEP[dir];
  return [c + dc, r + dr];
};

// World-space center of a cell.
export const cellCenter = ([c, r]: Cell, tile: number): Vector3 =>
  new Vector3(c * tile, 0, r * tile);

// World-space midpoint of one of a cell's four edges — where a wall/doorway on that edge sits.
export const edgeMidpoint = ([c, r]: Cell, dir: Dir, tile: number): Vector3 => {
  const [dc, dr] = STEP[dir];
  return new Vector3((c + dc / 2) * tile, 0, (r + dr / 2) * tile);
};

// Y-rotation (radians) for a wall slab on a given edge. A slab is authored long along X (an
// east-west wall, so it caps N/S edges with no rotation); E/W edges run along Z, so rotate 90°.
export const edgeRotationY = (dir: Dir): number => (dir === "E" || dir === "W" ? r90 : 0);

// Y-rotation so an object built facing +Z (south) at rest actually points toward `dir`. Positive
// Y-rotation is counterclockwise from above, so the sequence runs S→E→N→W. Furniture/props use this
// to orient on the grid.
export const facingRotationY = (dir: Dir): number =>
  ({ S: 0, E: r90, N: r90 * 2, W: r90 * 3 } as const)[dir];

// A stable string key for the undirected edge between two adjacent cells. The edge on the E side
// of [c,r] is the SAME physical edge as the W side of [c+1,r]; canonicalizing to one key lets the
// navmesh ask "is there a wall between these two cells?" without double-counting.
export const edgeKey = (a: Cell, b: Cell): string => {
  const ka = `${a[0]},${a[1]}`;
  const kb = `${b[0]},${b[1]}`;
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
};

// The canonical edge key for "the `dir` edge of cell `cell`" — i.e. between cell and its neighbour.
export const cellEdgeKey = (cell: Cell, dir: Dir): string => edgeKey(cell, step(cell, dir));
