import { findCells } from "./nav";
import type { Bar, Nav } from "./nav";
import { FLOOR_ORDER } from "./types";
import type { FloorId, Pos, Vec3 } from "./types";

// A route is the line someone actually walks: the grid's zig-zag pulled taut, then its corners
// rounded so nobody turns on the spot. Stairs are kept as one straight run up or down the flight.

export type Route = {
  points: Vec3[];
  /** Distance walked on reaching each point. */
  along: number[];
  /** Whether the stretch ending at each point is on a stair. */
  stair: boolean[];
  length: number;
};

/** How finely a straight line is checked against the floor grid. */
const SIGHT_STEP = 0.04;
/** A line is checked this far to either side as well, so it cannot graze the corner of a square. */
const SIGHT_SHOULDER = 0.06;
/** The radii a corner is rounded to, widest first: the first that fits past the furniture is used. */
const CORNER_RADII = [0.5, 0.32, 0.18];
/** Points laid along each rounded corner. */
const CORNER_STEPS = 8;
const Y_EPS = 1e-6;
const SAME_POINT = 1e-6;

const floorAtY = (nav: Nav, y: number): FloorId => FLOOR_ORDER.find((f) => Math.abs(nav.plan.storeys[f].y - y) < Y_EPS) ?? "ground";

/** Can someone walk straight from a to b on one storey without leaving the floor? */
const clearLine = (nav: Nav, floor: FloorId, a: Vec3, b: Vec3): boolean => {
  const dist = Math.hypot(b.x - a.x, b.z - a.z);
  if (dist === 0) return nav.walkable(floor, a.x, a.z);
  const steps = Math.max(1, Math.ceil(dist / SIGHT_STEP));
  const sideX = (-(b.z - a.z) / dist) * SIGHT_SHOULDER;
  const sideZ = ((b.x - a.x) / dist) * SIGHT_SHOULDER;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    if (!nav.walkable(floor, x, z) || !nav.walkable(floor, x + sideX, z + sideZ) || !nav.walkable(floor, x - sideX, z - sideZ)) return false;
  }
  return true;
};

/** Drop every point that the ones either side of it can see past. */
const pullTaut = (nav: Nav, floor: FloorId, cells: Vec3[]): Vec3[] => {
  const out: Vec3[] = [cells[0]];
  let from = 0;
  while (from < cells.length - 1) {
    let reach = from + 1;
    for (let j = cells.length - 1; j > from + 1; j--) {
      if (clearLine(nav, floor, cells[from], cells[j])) {
        reach = j;
        break;
      }
    }
    out.push(cells[reach]);
    from = reach;
  }
  return out;
};

const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
const gap = (a: Vec3, b: Vec3): number => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);

/** Replace each sharp corner with a short curve that stays inside it. */
const roundCorners = (nav: Nav, floor: FloorId, pts: Vec3[]): Vec3[] => {
  if (pts.length < 3) return pts;
  const out: Vec3[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const before = pts[i - 1];
    const corner = pts[i];
    const after = pts[i + 1];
    // A curve cuts inside its corner, towards whatever the path was bending round. Try a wide
    // curve first, then tighter ones; if even the tightest would clip a table leg, keep the corner.
    let rounded: Vec3[] = [corner];
    for (const radius of CORNER_RADII) {
      const r = Math.min(radius, gap(before, corner) / 2, gap(corner, after) / 2);
      const start = lerp(corner, before, r / gap(before, corner));
      const end = lerp(corner, after, r / gap(corner, after));
      const curve: Vec3[] = [];
      for (let s = 0; s <= CORNER_STEPS; s++) {
        const t = s / CORNER_STEPS;
        curve.push(lerp(lerp(start, corner, t), lerp(corner, end, t), t));
      }
      if (curve.every((p) => nav.fits(floor, p.x, p.z))) {
        rounded = curve;
        break;
      }
    }
    out.push(...rounded);
  }
  out.push(pts[pts.length - 1]);
  return out;
};

const measure = (points: Vec3[], stair: boolean[]): Route => {
  const along = [0];
  for (let i = 1; i < points.length; i++) along.push(along[i - 1] + gap(points[i - 1], points[i]));
  return { points, along, stair, length: along[along.length - 1] };
};

/** A walk straight from point to point, wherever they are: for someone out of doors, where there is no floor to find a way across. */
export const straightRoute = (points: Vec3[]): Route => measure(points, points.map(() => false));

/** The walk from one place to another, or null when there is no way. Ground that is barred is gone round, if there is a way round it. */
export const findRoute = (nav: Nav, from: Pos, to: Pos, bar: Bar | null = null): Route | null => {
  const cells = findCells(nav, from, to, bar);
  if (!cells) return null;
  // The way is pulled taut and its corners rounded over floor that is not barred, so that neither cuts back across what was gone round.
  const open: Nav = bar ? { ...nav, walkable: (floor, x, z) => nav.walkable(floor, x, z) && !bar(floor, x, z), fits: (floor, x, z) => nav.fits(floor, x, z) && !bar(floor, x, z) } : nav;
  const startY = nav.plan.storeys[from.floor].y;
  const endY = nav.plan.storeys[to.floor].y;
  // Start and finish exactly where asked, not at the middle of the nearest grid square.
  const exact = [{ x: from.x, y: startY, z: from.z }, ...cells.slice(1, -1), { x: to.x, y: endY, z: to.z }];
  const path = cells.length === 1 ? [exact[0], exact[exact.length - 1]] : exact;

  // Cut the path into runs on one storey; between two runs is a flight of stairs.
  const points: Vec3[] = [];
  const stair: boolean[] = [];
  let run: Vec3[] = [];
  const closeRun = (): void => {
    if (run.length === 0) return;
    const floor = floorAtY(nav, run[0].y);
    const smooth = run.length > 1 ? roundCorners(open, floor, pullTaut(open, floor, run)) : run;
    for (const p of smooth) {
      // Two curves that meet end to start share a point; it is only wanted once.
      if (points.length > 0 && gap(points[points.length - 1], p) < SAME_POINT) continue;
      // The first point of a run after a stair is the top (or bottom) of that stair.
      stair.push(points.length > 0 && Math.abs(points[points.length - 1].y - p.y) > Y_EPS);
      points.push(p);
    }
    run = [];
  };
  for (const p of path) {
    const last = run[run.length - 1];
    if (last && Math.abs(last.y - p.y) > Y_EPS) {
      // A change of storey: walk to the end of the flight, straight along it, and off the other end.
      const lowY = Math.min(last.y, p.y);
      const highY = Math.max(last.y, p.y);
      const flight = nav.plan.stairs.find((s) => Math.abs(nav.plan.storeys[s.lower].y - lowY) < Y_EPS && Math.abs(nav.plan.storeys[s.upper].y - highY) < Y_EPS);
      if (flight) {
        const foot = { x: flight.x, y: lowY, z: flight.zFoot };
        const head = { x: flight.x, y: highY, z: flight.zHead };
        const up = p.y > last.y;
        run.push(up ? foot : head);
        closeRun();
        run.push(up ? head : foot);
      } else closeRun();
    }
    run.push(p);
  }
  closeRun();
  return measure(points, stair);
};

/** Where someone is after walking `s` metres of a route, and which way they are heading. */
export const pointAlong = (route: Route, s: number): { pos: Vec3; heading: number; onStair: boolean } => {
  const { points, along } = route;
  const clamped = Math.max(0, Math.min(route.length, s));
  let i = 1;
  while (i < points.length - 1 && along[i] < clamped) i++;
  const a = points[i - 1];
  const b = points[Math.min(i, points.length - 1)];
  const span = along[Math.min(i, along.length - 1)] - along[i - 1];
  const t = span > 0 ? (clamped - along[i - 1]) / span : 0;
  return { pos: lerp(a, b, t), heading: Math.atan2(b.x - a.x, b.z - a.z), onStair: route.stair[Math.min(i, route.stair.length - 1)] ?? false };
};
