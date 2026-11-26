import { resolveTransform } from "./transform";
import { BlockParams, Placement } from "./types";
import { WALL_THICKNESS } from "./dims";
import { BARREL_RADIUS, CHAIR_SEAT, PLANT_POT_RADIUS } from "./kinds/furniture";

// Furniture footprints for navmesh carving: the floor area a piece physically occupies, so the
// navmesh derivation (level-nav.ts) can remove the nodes it sits on and the edges that pass under
// it. Pure geometry (no Three beyond the Vector3 in resolveTransform) so it's unit-tested.
//
// Each footprint is inflated by a CLEARANCE buffer before testing, representing the room a walking
// body needs beside an obstacle. 0.25 m ≈ the character's half-width (the body-anchored 0.5 m cell),
// so the carve removes a piece's real footprint plus just enough that a body can't overlap it —
// without eating into the next cell over. (At a full 0.45 m the no-go rings of densely-placed
// furniture overlap and fragment a room into disconnected islands; see the disconnection warning.)
export const FURNITURE_NAV_BUFFER = 0.25;

// A rotated rectangle in the XZ plane (world units), already inflated by the clearance buffer.
export type FootRect = { cx: number; cz: number; halfW: number; halfD: number; angle: number };

const num = (p: BlockParams | undefined, key: string, fallback: number): number =>
  p && typeof p[key] === "number" ? (p[key] as number) : fallback;

// Obstacle furniture and their footprint dimensions (matching the meshes in kinds/*). Blocks
// not listed here don't carve the navmesh: floors, rugs (flat), lamps/glow (lights), and the edge
// blocks (walls/doorways/windows, handled separately by edge blocking).
//
// An entry may override the clearance `buffer`: walls/windows are NOT furniture — bodies hug them
// exactly as they hug grid-edge walls (which block edges but never carve cells), so their carve is
// the bare slab. With the furniture buffer a 0.15 m partition lying on a cell boundary would cover
// the cell centers 0.25 m away on BOTH sides and sever every room it borders.
const FOOTPRINTS: Record<
  string,
  (p?: BlockParams) => { w: number; d: number; buffer?: number } | null
> = {
  // A FREE-anchored wall (the parametric two-point `wall`, possibly diagonal) can't block grid
  // edges the way edge-anchored walls do, so it declares its length via `footprintW` and the
  // navmesh carves it like a rotated solid. Grid walls return null here — edge blocking in
  // level-nav.ts already handles them.
  wall: (p) =>
    typeof p?.footprintW === "number"
      ? { w: p.footprintW, d: num(p, "thickness", WALL_THICKNESS), buffer: 0 }
      : null,
  // A FREE window fill (the parametric `window` kind) blocks passage through its wall gap the way
  // a grid-edge window blocks its edge. Grid windows return null — edge blocking handles them.
  window: (p) =>
    typeof p?.footprintW === "number"
      ? { w: p.footprintW, d: num(p, "thickness", WALL_THICKNESS), buffer: 0 }
      : null,
  // A FREE railing (the parametric two-point `railing`) blocks passage across its run like a free
  // wall — zero clearance buffer, since a railing IS the barrier (no furniture-style standoff).
  // Grid-edge railings return null; edge blocking in level-nav.ts handles them.
  railing: (p) =>
    typeof p?.footprintW === "number"
      ? { w: p.footprintW, d: num(p, "thickness", 0.1), buffer: 0 }
      : null,
  table: (p) => ({ w: num(p, "w", 1.1), d: num(p, "d", 0.7) }),
  chair: () => ({ w: CHAIR_SEAT, d: CHAIR_SEAT }),
  cabinet: (p) => ({ w: num(p, "w", 0.9), d: num(p, "d", 0.4) }),
  bed: (p) => ({ w: num(p, "w", 1.0), d: num(p, "d", 1.9) }),
  fireplace: (p) => ({ w: num(p, "w", 1.2), d: num(p, "d", 0.4) }),
  plant: () => ({ w: PLANT_POT_RADIUS * 2, d: PLANT_POT_RADIUS * 2 }),
  barrel: () => ({ w: BARREL_RADIUS * 2, d: BARREL_RADIUS * 2 }),
  column: (p) => {
    const r = num(p, "radius", 0.12);
    return { w: r * 2, d: r * 2 };
  },
};

// The footprint dimensions for a block id, or null if the block doesn't obstruct the floor.
export const footprintOf = (
  block: string,
  params?: BlockParams,
): { w: number; d: number; buffer?: number } | null => FOOTPRINTS[block]?.(params) ?? null;

// The world-space, buffer-inflated footprint rectangle for a placement, or null if it's not an
// obstacle. Position + rotation come from the same resolveTransform the renderer uses, so the carve
// lines up with what's drawn.
export const placementFootprint = (
  placement: Placement,
  tile: number,
  buffer: number = FURNITURE_NAV_BUFFER,
): FootRect | null => {
  const dims = footprintOf(placement.block, placement.params);
  if (!dims) return null;
  const t = resolveTransform(placement, tile);
  const b = dims.buffer ?? buffer;
  return {
    cx: t.position.x,
    cz: t.position.z,
    halfW: dims.w / 2 + b,
    halfD: dims.d / 2 + b,
    angle: t.rotationY,
  };
};

// A world point expressed in the rectangle's local (unrotated) frame.
const toLocal = (r: FootRect, x: number, z: number): [number, number] => {
  const dx = x - r.cx;
  const dz = z - r.cz;
  const cos = Math.cos(r.angle);
  const sin = Math.sin(r.angle);
  return [dx * cos - dz * sin, dx * sin + dz * cos];
};

// Is the world point inside the (inflated) footprint?
export const rectCoversPoint = (r: FootRect, x: number, z: number): boolean => {
  const [lx, lz] = toLocal(r, x, z);
  return Math.abs(lx) <= r.halfW && Math.abs(lz) <= r.halfD;
};

// Does the world segment a→b intersect the (inflated) footprint? Liang–Barsky clip in local frame
// against the AABB [-halfW,halfW] × [-halfD,halfD]. True if any part of the segment is inside.
export const rectCoversSegment = (
  r: FootRect,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): boolean => {
  const [x0, z0] = toLocal(r, ax, az);
  const [x1, z1] = toLocal(r, bx, bz);
  const dx = x1 - x0;
  const dz = z1 - z0;
  let t0 = 0;
  let t1 = 1;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0; // parallel to this slab — inside iff q >= 0
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  return (
    clip(-dx, x0 + r.halfW) &&
    clip(dx, r.halfW - x0) &&
    clip(-dz, z0 + r.halfD) &&
    clip(dz, r.halfD - z0) &&
    t0 <= t1
  );
};
