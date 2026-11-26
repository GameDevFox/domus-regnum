import { Cell, cellCenter, Dir } from "../../blocks/grid";
import { isGridPlacement, Placement } from "../../blocks/types";

// Pure placement rules for the level editor — no Three, no scene state, so they're unit-testable.
// This is the single source of truth for "which blocks go where" that both the ghost cursor and the
// stamp action (applyAt) share.

// Which palette ids sit on a cell EDGE (walls/doorways/windows/railings) rather than on/over a cell.
export const EDGE_BLOCKS = new Set(["wall", "doorway", "window", "railing"]);
// Which are lights placed FREELY at the cell center rather than grid-anchored.
export const FREE_BLOCKS = new Set(["lamp", "glow"]);

// Default span (cells along the edge) when placing an edge block. Doorways default to a SINGLE cell
// so the navmesh has one node — one clear, centered pathway — through the opening (a span-2 door
// straddles two nodes, opening two parallel crossings). Windows aren't walked through, so they keep
// the wider ~1 m span-2 look. Walls stay 1 cell and tile into runs.
const EDGE_SPAN: Record<string, number> = { window: 2 };
export const spanFor = (block: string): number => EDGE_SPAN[block] ?? 1;

// Selectable = grabbable by a raycast click: everything EXCEPT the floor (clicking the ground would
// constantly grab tiles) and auto-derived corner posts (they regenerate from walls). Walls / doorways
// / windows ARE selectable so you can grab, move, rotate, or delete them (X) — there's no erase tool.
export const isSelectable = (block: string): boolean => block !== "floor" && block !== "corner";

// Placement-aware selectability: a region floor (size > 1×1) IS grabbable — it's a deliberate shape
// you move/resize/restyle as a unit — even though a plain single floor tile and auto-corners are not.
export const isSelectablePlacement = (p: Placement): boolean => {
  if (isGridPlacement(p) && !p.edge && p.block === "floor") {
    const s = p.size;
    return !!s && (s[0] > 1 || s[1] > 1);
  }
  return isSelectable(p.block);
};

// The placement the held `block` would create at `cell`, facing `facing`, on the build plane at world
// Y `y`, for a level of cell size `tile`. Edge blocks sit on the cell edge; free blocks at the cell
// center; everything else fills the cell. A grid placement's `y` is OMITTED when 0 so ground-floor
// data stays byte-identical to before multi-level; free placements always carry their world Y.
export const placementFor = (
  block: string,
  cell: Cell,
  facing: Dir,
  y: number,
  tile: number,
): Placement => {
  const elevation = y !== 0 ? y : undefined;
  if (EDGE_BLOCKS.has(block))
    return { block, cell, edge: facing, span: spanFor(block), y: elevation };
  if (FREE_BLOCKS.has(block)) {
    const p = cellCenter(cell, tile);
    return { block, pos: [p.x, y, p.z] };
  }
  return { block, cell, face: facing, y: elevation };
};
