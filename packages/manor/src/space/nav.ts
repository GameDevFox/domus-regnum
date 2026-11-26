import createGraph from "ngraph.graph";
import type { Graph } from "ngraph.graph";
import { aStar } from "ngraph.path";
import type { PathFinder } from "ngraph.path";

import { FLOOR_ORDER } from "./types";
import type { FloorId, Plan, Pos, Stair, Vec3 } from "./types";
import { deriveWalls, distanceToWall, inRect, roomRects } from "./walls";
import type { Wall } from "./walls";

// Where feet may go. Each storey is a grid of quarter-metre cells; a cell is floor if it is in a
// room, clear of the walls, and not under the furniture. Doorways are simply where the wall is
// missing. Stairs join one storey's grid to the next. The same recipe as the level navmesh in
// packages/domus (docs/design/08 §11): floors add, walls cut, footprints subtract.

export const CELL = 0.25;
/** A body's half-width plus half a wall: how near a wall's centre line a person's centre may come. */
const WALL_CLEARANCE = 0.3;
/** How near the edge of a piece of furniture a person's centre may come. */
const FIXTURE_CLEARANCE = 0.25;
/** The same two, at their tightest: what a rounded corner may shave, where a planned path may not go. */
const TIGHT_WALL_CLEARANCE = 0.2;
const TIGHT_FIXTURE_CLEARANCE = 0.14;
/** How near the side of a flight of stairs (its string and balusters) a person's centre may come. */
const STAIR_CLEARANCE = 0.32;
const TIGHT_STAIR_CLEARANCE = 0.22;
/** A stair costs more than its length: it is climbed slower than a floor is walked. */
export const STAIR_COST = 1.7;
/** How far out from the end of a flight someone lines up with it, so the turn is made on open floor. */
const STAIR_LANDING = 0.875;
const DIAGONAL = Math.SQRT2;
const STAIR_EDGE = 0.01;

type Cell = { floor: FloorId; x: number; y: number; z: number };

/** Ground that is floor, but is not to be walked over just now: where an open door's leaf stands, say. True of a point that is barred. */
export type Bar = (floor: FloorId, x: number, z: number) => boolean;

export type Nav = {
  plan: Plan;
  walls: Wall[];
  graph: Graph<Cell, number>;
  finder: PathFinder<Cell>;
  /** Find a way with some ground barred, or with none: every search is made through this, so that it says what is barred for it. */
  avoiding: <T>(bar: Bar | null, run: () => T) => T;
  cols: number;
  rows: number;
  originX: number;
  originZ: number;
  /** Is the cell holding this point floor? */
  walkable: (floor: FloorId, x: number, z: number) => boolean;
  /** Could a body be at exactly this point, squeezing as close to things as a body can? */
  fits: (floor: FloorId, x: number, z: number) => boolean;
  /** The nearest floor cell to a point, or null when there is none within reach. */
  nearest: (pos: Pos) => number | null;
  cell: (id: number) => Cell;
};

/**
 * Is a point taken up by a flight of stairs? The flight itself is, and so is a margin `clearance`
 * wide all round it — its sides, and the corners where the newel posts stand — except the lane
 * up the middle at each end, which is how the flight is stepped on to and off.
 */
const inStair = (s: Stair, x: number, z: number, clearance: number): boolean => {
  const zMin = Math.min(s.zFoot, s.zHead);
  const zMax = Math.max(s.zFoot, s.zHead);
  const beside = Math.max(0, Math.abs(x - s.x) - s.width / 2);
  const beyond = Math.max(0, zMin - z, z - zMax);
  const inLane = Math.abs(x - s.x) <= s.width / 2 - clearance;
  // In the lane only the flight proper counts, and its very edge is the first tread: still somewhere to stand.
  if (inLane) return z > zMin + STAIR_EDGE && z < zMax - STAIR_EDGE;
  return Math.hypot(beside, beyond) < clearance;
};

/** The last ordinary footstep at each end of a flight. */
export const stairEnds = (s: Stair): { foot: Pos; head: Pos } => {
  const away = Math.sign(s.zFoot - s.zHead);
  return {
    foot: { floor: s.lower, x: s.x, z: s.zFoot + away * STAIR_LANDING },
    head: { floor: s.upper, x: s.x, z: s.zHead - away * STAIR_LANDING },
  };
};

export const buildNav = (plan: Plan): Nav => {
  const walls = deriveWalls(plan);
  const rects = plan.rooms.flatMap(roomRects);
  const originX = Math.min(...rects.map((r) => r.x));
  const originZ = Math.min(...rects.map((r) => r.z));
  const cols = Math.ceil((Math.max(...rects.map((r) => r.x + r.w)) - originX) / CELL);
  const rows = Math.ceil((Math.max(...rects.map((r) => r.z + r.d)) - originZ) / CELL);
  const perFloor = cols * rows;

  const idOf = (floor: FloorId, col: number, row: number): number => FLOOR_ORDER.indexOf(floor) * perFloor + row * cols + col;
  const centre = (i: number): number => (i + 0.5) * CELL;

  const isFloor = (floor: FloorId, x: number, z: number, wallClearance = WALL_CLEARANCE, fixtureClearance = FIXTURE_CLEARANCE, stairClearance = STAIR_CLEARANCE): boolean => {
    const inRoom = plan.rooms.some((r) => r.floor === floor && roomRects(r).some((rect) => inRect(rect, x, z)));
    if (!inRoom) return false;
    if (walls.some((w) => w.floor === floor && distanceToWall(w, x, z) < wallClearance)) return false;
    if (plan.fixtures.some((f) => f.solid && f.floor === floor && inRect({ x: f.x - f.w / 2, z: f.z - f.d / 2, w: f.w, d: f.d }, x, z, fixtureClearance))) return false;
    // A flight fills its footprint on the storey it stands on, and is a hole in the one above.
    if (plan.stairs.some((s) => (s.lower === floor || s.upper === floor) && inStair(s, x, z, stairClearance))) return false;
    return true;
  };

  const graph = createGraph<Cell, number>();
  const open = new Set<number>();
  for (const floor of FLOOR_ORDER) {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = originX + centre(col);
        const z = originZ + centre(row);
        if (!isFloor(floor, x, z)) continue;
        const id = idOf(floor, col, row);
        open.add(id);
        graph.addNode(id, { floor, x, y: plan.storeys[floor].y, z });
      }
    }
  }
  for (const id of open) {
    const local = id % perFloor;
    const col = local % cols;
    const row = Math.floor(local / cols);
    const east = col + 1 < cols && open.has(id + 1);
    const south = row + 1 < rows && open.has(id + cols);
    if (east) graph.addLink(id, id + 1, CELL);
    if (south) graph.addLink(id, id + cols, CELL);
    // A diagonal step is only taken when both squares beside it are floor: no cutting corners.
    if (east && south && open.has(id + cols + 1)) graph.addLink(id, id + cols + 1, CELL * DIAGONAL);
    const west = col > 0 && open.has(id - 1);
    if (west && south && open.has(id + cols - 1)) graph.addLink(id, id + cols - 1, CELL * DIAGONAL);
  }

  const colOf = (x: number): number => Math.floor((x - originX) / CELL);
  const rowOf = (z: number): number => Math.floor((z - originZ) / CELL);
  const walkable = (floor: FloorId, x: number, z: number): boolean => {
    const col = colOf(x);
    const row = rowOf(z);
    return col >= 0 && col < cols && row >= 0 && row < rows && open.has(idOf(floor, col, row));
  };

  /** Rings of cells searched outward from a point that is not itself on floor. */
  const NEAREST_RINGS = 3;
  const nearest = (pos: Pos): number | null => {
    const col = colOf(pos.x);
    const row = rowOf(pos.z);
    let best: number | null = null;
    let bestDist = Infinity;
    for (let dr = -NEAREST_RINGS; dr <= NEAREST_RINGS; dr++) {
      for (let dc = -NEAREST_RINGS; dc <= NEAREST_RINGS; dc++) {
        const c = col + dc;
        const r = row + dr;
        if (c < 0 || c >= cols || r < 0 || r >= rows) continue;
        const id = idOf(pos.floor, c, r);
        if (!open.has(id)) continue;
        const dist = Math.hypot(originX + centre(c) - pos.x, originZ + centre(r) - pos.z);
        if (dist < bestDist) {
          best = id;
          bestDist = dist;
        }
      }
    }
    return best;
  };

  for (const s of plan.stairs) {
    const ends = stairEnds(s);
    const foot = nearest(ends.foot);
    const head = nearest(ends.head);
    if (foot === null || head === null) throw new Error(`The ${s.id} stair does not reach the floor at both ends`);
    const rise = plan.storeys[s.upper].y - plan.storeys[s.lower].y;
    graph.addLink(foot, head, 2 * STAIR_LANDING + Math.hypot(s.zFoot - s.zHead, rise) * STAIR_COST);
  }

  const cell = (id: number): Cell => {
    const node = graph.getNode(id);
    if (!node) throw new Error(`No floor at cell ${id}`);
    return node.data;
  };

  /** What is barred for the search that is under way, if anything is: every search says, as it begins, what is barred for it. */
  let barred: Bar | null = null;
  const avoiding = <T>(bar: Bar | null, run: () => T): T => {
    barred = bar;
    return run();
  };
  const isBarred = (at: Cell): boolean => barred !== null && barred(at.floor, at.x, at.z);

  const finder = aStar(graph, {
    blocked: (a, b) => isBarred(a.data) || isBarred(b.data),
    distance: (_from, _to, link) => link.data,
    heuristic: (from, to) => Math.hypot(from.data.x - to.data.x, from.data.y - to.data.y, from.data.z - to.data.z),
  });

  const fits = (floor: FloorId, x: number, z: number): boolean => isFloor(floor, x, z, TIGHT_WALL_CLEARANCE, TIGHT_FIXTURE_CLEARANCE, TIGHT_STAIR_CLEARANCE);

  return { plan, walls, graph, finder, avoiding, cols, rows, originX, originZ, walkable, fits, nearest, cell };
};

/** The cells walked through from one place to another, in order, or null when there is no way. Ground that is barred is not walked over, but where she stands and where she is going are never barred. */
export const findCells = (nav: Nav, from: Pos, to: Pos, bar: Bar | null = null): Vec3[] | null => {
  const a = nav.nearest(from);
  const b = nav.nearest(to);
  if (a === null || b === null) return null;
  if (a === b) return [nav.cell(a)].map(({ x, y, z }) => ({ x, y, z }));
  const ends = [nav.cell(a), nav.cell(b)];
  const butEnds: Bar | null = bar && ((floor, x, z) => bar(floor, x, z) && !ends.some((end) => end.floor === floor && end.x === x && end.z === z));
  const found = nav.avoiding(butEnds, () => nav.finder.find(a, b));
  if (found.length === 0) return null;
  // ngraph.path hands the path back end-first.
  const ordered = found[0].id === a ? found : [...found].reverse();
  // (With ground barred, it can hand back a goal it never reached, alone: that is no way.)
  if (ordered[0].id !== a || ordered[ordered.length - 1].id !== b) return null;
  return ordered.map((n) => ({ x: n.data.x, y: n.data.y, z: n.data.z }));
};
