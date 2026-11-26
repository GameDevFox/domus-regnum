import { r90 } from "@kitsune/common";

import { Cell, cellEdgeKey, Dir, rotateDir, step } from "./grid";
import { CULL_H, CULL_V, VIEW_SIDE, ViewSide } from "./properties";
import { BlockParams, GridPlacement, isGridPlacement, Level, Placement } from "./types";
import { WALL_THICKNESS } from "./dims";

// Every canonical edge key an edge placement covers, walking its `span` cells along the run (N/S
// edges run east, E/W edges run south). A span-1 block covers just its anchor edge — so this is
// backward-compatible with the original single-edge behaviour.
const coveredEdgeKeys = (p: GridPlacement): string[] => {
  const along: Dir = p.edge === "N" || p.edge === "S" ? "E" : "S";
  const keys: string[] = [];
  let cell = p.cell;
  for (let i = 0; i < (p.span ?? 1); i++) {
    keys.push(cellEdgeKey(cell, p.edge!));
    cell = step(cell, along);
  }
  return keys;
};

// Pure level-editing operations for the level editor. Levels are immutable values here — every op
// returns a NEW level — so the editor can drive a reactive `Value<Level>` (mountLevel re-renders on
// change) and get undo/redo for free by keeping a stack of these values. No Three, no DOM: testable.

// The "slot" a placement occupies, for replace-on-place semantics:
//   - an edge block (wall/doorway) owns its canonical edge — placing one replaces whatever was there
//   - a grid block on a cell owns (blockId, cell) — re-placing the same kind overwrites instead of
//     stacking, but different kinds (floor + chair) coexist on the same cell
//   - free placements have no slot — they always append
// The slot is scoped to the placement's ELEVATION (`y`), so the same cell on different floors are
// distinct slots — placing a floor tile upstairs never evicts the one directly below it.
const slotKey = (p: Placement): string | null => {
  if (!isGridPlacement(p)) return null;
  const y = p.y ?? 0;
  if (p.edge) return `edge:${cellEdgeKey(p.cell, p.edge)}@${y}`;
  return `cell:${p.block}:${p.cell[0]},${p.cell[1]}@${y}`;
};

// Add a placement, replacing any existing placement in the same slot.
export const placeBlock = (level: Level, placement: Placement): Level => {
  const key = slotKey(placement);
  const kept = key === null ? level.placements : level.placements.filter((p) => slotKey(p) !== key);
  return { ...level, placements: [...kept, placement] };
};

const atCell = (p: Placement, [c, r]: Cell): boolean =>
  isGridPlacement(p) && !p.edge && p.cell[0] === c && p.cell[1] === r;

// Remove every grid block anchored on a cell (floor + props), leaving edge blocks intact.
export const eraseCell = (level: Level, cell: Cell): Level => ({
  ...level,
  placements: level.placements.filter((p) => !atCell(p, cell)),
});

// Remove only a specific block kind from a cell (e.g. erase the chair but keep the floor).
export const eraseBlockAtCell = (level: Level, cell: Cell, block: string): Level => ({
  ...level,
  placements: level.placements.filter((p) => !(atCell(p, cell) && p.block === block)),
});

// Remove the edge block (wall/doorway/window) on a cell's edge, whichever side names it. Span-aware:
// a wide door/window is removed when you click any edge it covers, not only its anchor cell.
export const eraseEdge = (level: Level, cell: Cell, dir: Dir): Level => {
  const key = cellEdgeKey(cell, dir);
  return {
    ...level,
    placements: level.placements.filter(
      (p) => !(isGridPlacement(p) && p.edge && coveredEdgeKeys(p).includes(key)),
    ),
  };
};

// --- selection / move / rotate ----------------------------------------------------------------
// Pure ops backing the editor's "select existing element and move/rotate it" tool. They address a
// placement by its INDEX in the list (stable while you move/rotate — those replace in place), so the
// editor can hold a selected index and these never reorder the array out from under it.

// The lattice cell a placement occupies. Grid placements name their cell directly; free placements
// (furniture/lights) map their world position onto the nearest cell so they're cell-pickable too.
// For a region this is its NW anchor — see `placementCoversCell` for the full footprint.
export const placementCell = (p: Placement, tile: number): Cell =>
  isGridPlacement(p) ? p.cell : [Math.round(p.pos[0] / tile), Math.round(p.pos[2] / tile)];

// Whether a placement's footprint includes `cell` — so clicking ANY cell of a region floor picks the
// whole region, not just its anchor. A non-region grid block covers only its own cell; an edge block
// covers none (it lives on a boundary, picked via the edge tools); a free block covers its mapped
// cell.
export const placementCoversCell = (p: Placement, cell: Cell, tile: number): boolean => {
  if (isGridPlacement(p)) {
    if (p.edge) return false;
    const [c, r] = p.cell;
    const [w, h] = p.size ?? [1, 1];
    return cell[0] >= c && cell[0] < c + w && cell[1] >= r && cell[1] < r + h;
  }
  const [c, r] = placementCell(p, tile);
  return c === cell[0] && r === cell[1];
};

// Selection priority when several placements share a cell: a clickable prop/light beats the floor
// slab beneath it. Edge blocks (walls/doorways) belong to an edge, not a cell, so they're excluded
// from cell-selection (rank -1) — the editor selects them via the erase/edge tools instead.
const selectRank = (p: Placement): number => {
  if (isGridPlacement(p) && p.edge) return -1;
  if (!isGridPlacement(p)) return 2; // free props/lights sit on top
  return p.block === "floor" ? 0 : 1; // floor < grid props
};

// Index of the most relevant selectable placement at a cell, or -1 if none. Highest rank wins;
// ties break toward the LAST placement (the one drawn on top / most recently added).
export const findPlacementAt = (level: Level, cell: Cell): number => {
  let best = -1;
  let bestRank = -1;
  level.placements.forEach((p, i) => {
    const rank = selectRank(p);
    if (rank < 0) return;
    if (!placementCoversCell(p, cell, level.tile)) return;
    if (rank >= bestRank) {
      best = i;
      bestRank = rank;
    }
  });
  return best;
};

// Normalize two corner cells (drawn in any order) into a region rect: NW anchor + positive [w,h].
// This is what a drag-rectangle in the editor produces.
export const regionRect = (a: Cell, b: Cell): { cell: Cell; size: [number, number] } => {
  const x = Math.min(a[0], b[0]);
  const y = Math.min(a[1], b[1]);
  return { cell: [x, y], size: [Math.abs(a[0] - b[0]) + 1, Math.abs(a[1] - b[1]) + 1] };
};

// Lay down a floor region covering the rect [cell .. cell+size). Any floor placements (single tiles
// OR regions) whose footprint overlaps are removed first, so the new merged region never z-fights or
// double-pays for the cells underneath it. The region appends on top of non-floor content (props
// stay). This is what the editor's region draw commits.
export const placeRegion = (
  level: Level,
  cell: Cell,
  size: [number, number],
  params?: BlockParams,
): Level => {
  const w = Math.max(1, Math.round(size[0]));
  const h = Math.max(1, Math.round(size[1]));
  const overlapsFloor = (p: Placement): boolean => {
    if (!isGridPlacement(p) || p.edge || p.block !== "floor") return false;
    const [pw, ph] = p.size ?? [1, 1];
    return (
      cell[0] < p.cell[0] + pw &&
      p.cell[0] < cell[0] + w &&
      cell[1] < p.cell[1] + ph &&
      p.cell[1] < cell[1] + h
    );
  };
  const kept = level.placements.filter((p) => !overlapsFloor(p));
  const region: Placement = { block: "floor", cell, size: [w, h], ...(params ? { params } : {}) };
  return { ...level, placements: [...kept, region] };
};

// Move/resize the region at `index` to a new rect (anchor + size), clamped to at least 1×1. Replaces
// in place so the editor's selected index stays valid; preserves block + params. No-op out of range.
export const setRegionRect = (
  level: Level,
  index: number,
  cell: Cell,
  size: [number, number],
): Level => {
  const p = level.placements[index];
  if (!p || !isGridPlacement(p)) return level;
  const next: Placement = {
    ...p,
    cell,
    size: [Math.max(1, Math.round(size[0])), Math.max(1, Math.round(size[1]))],
  };
  const placements = level.placements.slice();
  placements[index] = next;
  return { ...level, placements };
};

// Move the placement at `index` to a new cell, preserving any sub-cell offset (free placements move
// by the matching world delta) and all other fields. No-op if the index is out of range or unmoved.
export const movePlacement = (level: Level, index: number, toCell: Cell): Level => {
  const p = level.placements[index];
  if (!p) return level;
  const from = placementCell(p, level.tile);
  const dc = toCell[0] - from[0];
  const dr = toCell[1] - from[1];
  if (dc === 0 && dr === 0) return level;
  const moved: Placement = isGridPlacement(p)
    ? { ...p, cell: [p.cell[0] + dc, p.cell[1] + dr] as Cell }
    : { ...p, pos: [p.pos[0] + dc * level.tile, p.pos[1], p.pos[2] + dr * level.tile] };
  const placements = level.placements.slice();
  placements[index] = moved;
  return { ...level, placements };
};

// Set the elevation (world Y of the plane it sits on) of the placement at `index`. Grid placements
// carry `y` (omitted when 0 to keep ground-floor data clean); free placements store it in `pos.y`.
// No-op if the index is out of range or it's already at that elevation.
export const setPlacementElevation = (level: Level, index: number, y: number): Level => {
  const p = level.placements[index];
  if (!p) return level;
  const current = isGridPlacement(p) ? (p.y ?? 0) : p.pos[1];
  if (current === y) return level;
  const next: Placement = isGridPlacement(p)
    ? { ...p, y: y === 0 ? undefined : y }
    : { ...p, pos: [p.pos[0], y, p.pos[2]] };
  const placements = level.placements.slice();
  placements[index] = next;
  return { ...level, placements };
};

// Set (or clear) a single editable `param` on the placement at `index`. Passing `undefined` removes
// the key, and an emptied `params` is dropped entirely — so storing a field at its default leaves the
// data byte-identical to before (same "omit defaults" convention as `y`/elevation). Replaces in place
// so the editor's selected index stays valid. No-op if the index is out of range.
export const setPlacementParam = (
  level: Level,
  index: number,
  key: string,
  value: string | number | boolean | undefined,
): Level => {
  const p = level.placements[index];
  if (!p) return level;
  const params = { ...p.params };
  if (value === undefined) delete params[key];
  else params[key] = value;
  const next: Placement = { ...p, params: Object.keys(params).length > 0 ? params : undefined };
  const placements = level.placements.slice();
  placements[index] = next;
  return { ...level, placements };
};

// Rotate the placement at `index` by `steps` quarter-turns. Free placements turn via `rotY`; grid
// props cycle their `face`; edge blocks cycle their `edge`. No-op if the index is out of range.
export const rotatePlacement = (level: Level, index: number, steps = 1): Level => {
  const p = level.placements[index];
  if (!p) return level;
  let next: Placement;
  if (!isGridPlacement(p)) next = { ...p, rotY: (p.rotY ?? 0) + steps * r90 };
  else if (p.edge) next = { ...p, edge: rotateDir(p.edge, steps) };
  else next = { ...p, face: rotateDir(p.face ?? "N", steps) };
  const placements = level.placements.slice();
  placements[index] = next;
  return { ...level, placements };
};

// Remove the placement at `index` (e.g. erase the selected element). No-op if out of range.
export const removePlacement = (level: Level, index: number): Level => {
  if (index < 0 || index >= level.placements.length) return level;
  return { ...level, placements: level.placements.filter((_, i) => i !== index) };
};

// Shift a level so its floor footprint is centered on the world origin. Grid cells move by an integer
// offset (so they stay aligned); free placements move the matching world distance. No-op if there are
// no floors or it's already centered.
export const centerLevel = (level: Level): Level => {
  let minC = Infinity;
  let minR = Infinity;
  let maxC = -Infinity;
  let maxR = -Infinity;
  for (const p of level.placements) {
    if (isGridPlacement(p) && p.block === "floor" && !p.edge) {
      minC = Math.min(minC, p.cell[0]);
      maxC = Math.max(maxC, p.cell[0]);
      minR = Math.min(minR, p.cell[1]);
      maxR = Math.max(maxR, p.cell[1]);
    }
  }
  if (!Number.isFinite(minC)) return level; // no floors to center on
  const dc = -Math.round((minC + maxC) / 2);
  const dr = -Math.round((minR + maxR) / 2);
  if (dc === 0 && dr === 0) return level;

  const placements = level.placements.map(
    (p): Placement =>
      isGridPlacement(p)
        ? { ...p, cell: [p.cell[0] + dc, p.cell[1] + dr] as Cell }
        : { ...p, pos: [p.pos[0] + dc * level.tile, p.pos[1], p.pos[2] + dr * level.tile] },
  );
  return { ...level, placements };
};

// Add a corner post at every vertex where a horizontal and a vertical wall meet (building corners, T-
// and cross-junctions), so corners read as solid instead of leaving an unfilled outer wedge. Pure:
// emits new "corner" free placements at the junctions, sized/coloured from the thickest wall meeting
// there. Run BEFORE centerLevel so the free corners shift with the rest of the level.
const WALL_BLOCKS = new Set(["wall", "doorway", "window"]);

export const addWallCorners = (level: Level): Level => {
  const { tile, placements } = level;
  // Per grid vertex (in cell units, half-integers): does a horizontal / vertical wall touch it, the
  // params of the thickest such wall (so the post matches it), and each direction's `viewSide` so the
  // corner can cull with its two walls (hView = horizontal/+Z wall, vView = vertical/+X wall).
  type Junction = {
    h: boolean;
    v: boolean;
    thickness: number;
    height?: number;
    color?: number;
    hView?: ViewSide;
    vView?: ViewSide;
  };
  const verts = new Map<string, Junction>();
  const touch = (key: string, dir: "h" | "v", p: GridPlacement) => {
    const j = verts.get(key) ?? { h: false, v: false, thickness: 0 };
    j[dir] = true;
    const vs = p.params?.[VIEW_SIDE];
    if (vs === "front" || vs === "back") j[dir === "h" ? "hView" : "vView"] = vs;
    const th = typeof p.params?.thickness === "number" ? p.params.thickness : WALL_THICKNESS;
    if (th >= j.thickness) {
      j.thickness = th;
      if (typeof p.params?.height === "number") j.height = p.params.height;
      if (typeof p.params?.color === "number") j.color = p.params.color;
    }
    verts.set(key, j);
  };

  for (const p of placements) {
    if (!isGridPlacement(p) || !p.edge || !WALL_BLOCKS.has(p.block)) continue;
    const [c, r] = p.cell;
    const span = p.span ?? 1;
    if (p.edge === "N" || p.edge === "S") {
      const z = p.edge === "N" ? r - 0.5 : r + 0.5; // the edge's fixed Z; run is along X
      for (let i = 0; i <= span; i++) touch(`${c - 0.5 + i},${z}`, "h", p);
    } else {
      const x = p.edge === "W" ? c - 0.5 : c + 0.5; // the edge's fixed X; run is along Z
      for (let i = 0; i <= span; i++) touch(`${x},${r - 0.5 + i}`, "v", p);
    }
  }

  const corners: Placement[] = [];
  for (const [key, j] of verts) {
    if (!(j.h && j.v)) continue; // only where both directions meet (a real corner / junction)
    const [vx, vz] = key.split(",").map(Number);
    corners.push({
      block: "corner",
      pos: [vx * tile, 0, vz * tile],
      params: {
        thickness: j.thickness,
        runStart: vx * tile,
        ...(j.height != null ? { height: j.height } : {}),
        ...(j.color != null ? { color: j.color } : {}),
        ...(j.hView ? { [CULL_H]: j.hView } : {}),
        ...(j.vView ? { [CULL_V]: j.vView } : {}),
      },
    });
  }
  return { ...level, placements: [...placements, ...corners] };
};

// Serialize a level to pretty JSON for save/export.
export const serializeLevel = (level: Level): string => JSON.stringify(level, null, 2);

// Parse a level from JSON, with a minimal shape check so a bad paste fails loudly rather than
// rendering garbage.
export const deserializeLevel = (json: string): Level => {
  const obj = JSON.parse(json) as Partial<Level>;
  if (
    typeof obj.name !== "string" ||
    typeof obj.tile !== "number" ||
    !Array.isArray(obj.placements)
  )
    throw new Error("Invalid level: expected { name, tile, placements }");
  return obj as Level;
};
