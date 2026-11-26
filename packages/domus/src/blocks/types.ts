import { Object3D } from "three";

import { Scope } from "@kitsune/common-web/src/scope";

import { Cell, Dir } from "./grid";

// A built block instance. Visual-only for now (just a mesh), per the design decision — but the
// type is deliberately open so a later pass can add spatial metadata (e.g. `footprint?`) without
// breaking any caller. The mesh is positioned by the interpreter, so a factory builds in LOCAL
// space (centered at origin, unrotated) and ignores where it ends up.
export type Block = {
  mesh: Object3D;
};

// Per-block parameters — color, size, material variant, etc. Loose by design: each block kind
// reads the params it understands. Must stay JSON-serializable so a level round-trips to disk.
export type BlockParams = Record<string, string | number | boolean | undefined>;

// A block kind: a factory from (scope, params) to a built block. Same shape as the registry's
// component contract elsewhere, minus the transform (the interpreter applies that). `scope` is
// for any cleanup the block needs (rare for static geometry, but available).
export type BlockFactory = (scope: Scope, params: BlockParams) => Block;

// The set of block kinds a level can reference, keyed by string id ("floor", "wall", …). Keeping
// the indirection (id -> factory) is what makes levels serializable: the saved data names a block
// by id, and the registry resolves it to code at mount time.
export type BlockRegistry = Record<string, BlockFactory>;

// Where a block goes. Two flavors, matching the hybrid placement decision:
//
//   - Grid-anchored: snapped to a cell. A floor fills the cell; a wall/doorway sits on an `edge`;
//     a prop can `face` a direction. This is for structural geometry that should tile cleanly.
//   - Free: an arbitrary world position + Y-rotation. This is for furniture/props/lights that want
//     to sit anywhere, not just on the lattice.
//
// Discriminated by the presence of `cell`. Both are plain JSON.
export type GridPlacement = {
  // Stable identity for keyed mounting. IN-MEMORY ONLY: the parametric deriver stamps
  // `nodeId/localKey` here so mountLevel reconciles by identity (only changed blocks
  // rebuild); hand-authored levels omit it (mounting falls back to index keys). Never
  // saved — level files persist the parametric source, not placements.
  id?: string;
  block: string;
  cell: Cell;
  edge?: Dir; // present => the block sits on this edge of the cell (wall/doorway)
  span?: number; // for edge blocks: how many cells along the edge it covers (default 1)
  face?: Dir; // present => orient the block to face this direction (props)
  y?: number; // world elevation of the cell plane in meters (default 0) — for multi-level builds
  // For a REGION block (e.g. a floor): the [w, h] rectangle of cells it covers, anchored at `cell`
  // (its NW corner). Absent / [1,1] = a single cell. One sized placement renders as one merged,
  // texture-tiled mesh and contributes all its cells to the navmesh — so a 10×12 floor is one quad,
  // not 120. The primitive-shapes editor tool emits these.
  size?: [number, number];
  params?: BlockParams;
};

export type FreePlacement = {
  id?: string; // see GridPlacement.id — in-memory keyed-mounting identity
  block: string;
  pos: [number, number, number];
  rotY?: number; // radians
  params?: BlockParams;
};

export type Placement = GridPlacement | FreePlacement;

export const isGridPlacement = (p: Placement): p is GridPlacement => "cell" in p;

// A whole authored level: the tile size plus a flat list of placements. Flat + serializable is the
// on-disk format; richer authoring helpers (see author.ts) just generate these lists.
export type Level = {
  name: string;
  tile: number; // world units per cell
  placements: Placement[];
};
