import { Vector3 } from "three";

import { Nav, NodeId } from "../world/nav";
import { buildNavMesh, NavMesh } from "../world/navmesh";

import {
  FootRect,
  FURNITURE_NAV_BUFFER,
  placementFootprint,
  rectCoversPoint,
  rectCoversSegment,
} from "./footprint";
import { Cell, cellCenter, cellEdgeKey, Dir, opposite, step } from "./grid";
import { isGridPlacement, Placement, Level } from "./types";
import { STOREY_RISE } from "./dims";

// Derive a navmesh from an authored level — the "separate pass" we deferred when deciding blocks
// would be visual-only. Walkable nodes come from floor cells; links are added between adjacent floor
// cells UNLESS a wall sits on the shared edge (doorways are passable). With `diagonals` on (default),
// 8-way movement is added so agents don't zig-zag — with a corner-cut guard so a diagonal can't slip
// through a wall corner or between obstacles. The result is a real `Nav` the headless agent/haul sim
// can path on, so the authored geometry and the simulation share one world.
//
// Multi-level: a node is identified by (cell, elevation) — its id is the coordinate key "c,r,y" — so
// floor tiles stacked on the same cell at different `y` are distinct nodes. Links only join cells at
// the SAME elevation; crossing floors is left to stairs (a later slice), so an upper floor with no
// connector shows up as its own `components` island (the editor's disconnection warning).
export type LevelNav = NavMesh & {
  cells: Cell[]; // node index -> the cell it represents (for the wireframe overlay)
  nodeAt: (cell: Cell, y?: number) => NodeId | null; // (cell, elevation) -> node id (null if unwalkable)
  nav: Nav;
  components: number; // count of connected walkable regions — > 1 means furniture/walls/floors split it
};

export type LevelNavOptions = {
  diagonals?: boolean; // add 8-way diagonal edges (default true)
  furniture?: boolean; // carve furniture footprints out of the walkable graph (default true)
  buffer?: number; // clearance added around each furniture footprint (default FURNITURE_NAV_BUFFER)
  smooth?: boolean; // string-pull findPath polylines so agents walk straight lines (default true)
};

// A walkable node: a floor cell at a given elevation. The id key "c,r,y" is what makes stacked
// floors distinct (and is the coordinate-as-id the runtime nav uses directly).
type FloorNode = { cell: Cell; y: number };
const nkey = ([c, r]: Cell, y: number): string => `${c},${r},${y}`;

// Every INTEGER cell whose center a (possibly fractional) grid region covers — the same rule
// footprints use, half-open on the east/south edges. Shared by floor rasterization and ramps.
const REGION_EPS = 1e-6;
const cellsOfRegion = (p: { cell: Cell; size?: [number, number] }): Cell[] => {
  const [sw, sh] = p.size ?? [1, 1];
  const x0 = p.cell[0] - 0.5; // region bounds in cell units (a cell spans ±0.5 around it)
  const z0 = p.cell[1] - 0.5;
  const cells: Cell[] = [];
  for (let row = Math.ceil(z0 - REGION_EPS); row < z0 + sh - REGION_EPS; row++)
    for (let col = Math.ceil(x0 - REGION_EPS); col < x0 + sw - REGION_EPS; col++) cells.push([col, row]);
  return cells;
};
// An edge slot is also elevation-scoped: a wall on floor 2 only blocks floor-2 passage.
const ekey = (cell: Cell, dir: Dir, y: number): string => `${cellEdgeKey(cell, dir)},${y}`;
// A placement's elevation: grid blocks carry `y`; free placements use pos.y.
const elevationOf = (p: Placement): number => (isGridPlacement(p) ? (p.y ?? 0) : p.pos[1]);

// Default vertical rise of a stair = one storey (matches the editor's Shift+PageUp jump). A stair
// placement may override it with `params.rise`.

// The only edge block an agent can walk through. Everything else (wall, window, …) blocks passage.
const PASSABLE_EDGE = new Set(["doorway"]);

export const buildLevelNav = (
  level: Level,
  {
    diagonals = true,
    furniture = true,
    buffer = FURNITURE_NAV_BUFFER,
    smooth = true,
  }: LevelNavOptions = {},
): LevelNav => {
  const { tile, placements } = level;

  // Furniture footprints (buffer-inflated rotated rects) that carve the floor — each tagged with the
  // furniture's elevation so a table upstairs never carves the floor below it. A cell whose center is
  // covered (at the same `y`) isn't walkable; an edge whose segment crosses one is removed.
  const foots: { rect: FootRect; y: number }[] = furniture
    ? placements.flatMap((p) => {
        const rect = placementFootprint(p, tile, buffer);
        return rect ? [{ rect, y: elevationOf(p) }] : [];
      })
    : [];
  const cellCovered = (cell: Cell, y: number): boolean => {
    if (foots.length === 0) return false;
    const c = cellCenter(cell, tile);
    return foots.some((f) => f.y === y && rectCoversPoint(f.rect, c.x, c.z));
  };
  const segCovered = (a: Cell, b: Cell, y: number): boolean => {
    if (foots.length === 0) return false;
    const pa = cellCenter(a, tile);
    const pb = cellCenter(b, tile);
    return foots.some((f) => f.y === y && rectCoversSegment(f.rect, pa.x, pa.z, pb.x, pb.z));
  };

  // Walkable nodes = floor tiles (at their elevation) not covered by furniture.
  const floorNodes = new Map<string, FloorNode>();
  for (const p of placements)
    if (isGridPlacement(p) && p.block === "floor" && !p.edge) {
      const y = p.y ?? 0;
      // A region floor (size [w,h]) contributes every cell whose center it covers (see
      // cellsOfRegion), so one merged floor still pathfinds cell-by-cell.
      for (const cell of cellsOfRegion(p))
        if (!cellCovered(cell, y)) floorNodes.set(nkey(cell, y), { cell, y });
    }

  // Ramps: a sloped floor region. Each cell becomes a walkable node like a flat floor cell, only
  // its elevation is painted on — yBase at the foot, climbing toward yBase+rise at the head along
  // `dir`. Cell centres land on the rendered surface (yBase + rise·(i+0.5)/steps for run-index i),
  // so an agent walks up/down (run links, added below) and across (the generic same-elevation linker
  // handles width) in discrete units. Foot/head connectors to the adjoining floors are added after
  // the generic linking. STOREY_RISE (blocks/dims.ts) is the default climb if a placement omits `rise`.
  type RampLink = { fromKey: string; upKey: string; footKey?: string };
  const rampLinks: RampLink[] = [];
  for (const p of placements) {
    if (!isGridPlacement(p) || p.block !== "ramp" || p.edge) continue;
    const yBase = p.y ?? 0;
    const rise = typeof p.params?.rise === "number" ? p.params.rise : STOREY_RISE;
    const dir = (typeof p.params?.dir === "string" ? p.params.dir : "N") as Dir;
    const cells = cellsOfRegion(p);
    if (cells.length === 0) continue;
    const colMin = Math.min(...cells.map((c) => c[0]));
    const colMax = Math.max(...cells.map((c) => c[0]));
    const rowMin = Math.min(...cells.map((c) => c[1]));
    const rowMax = Math.max(...cells.map((c) => c[1]));
    const alongZ = dir === "N" || dir === "S";
    const steps = alongZ ? rowMax - rowMin + 1 : colMax - colMin + 1; // cells along the run
    // Run-index: 0 at the foot (downhill), steps-1 at the head (uphill). dir is the climb direction.
    const runIndex = ([col, row]: Cell): number =>
      dir === "N" ? rowMax - row : dir === "S" ? row - rowMin : dir === "E" ? col - colMin : colMax - col;
    const elevAt = (i: number): number => yBase + (rise * (i + 0.5)) / steps;
    for (const cell of cells) {
      const i = runIndex(cell);
      const y = elevAt(i);
      floorNodes.set(nkey(cell, y), { cell, y });
      // Uphill neighbour: the next ramp step, or — at the head — the upper floor at yBase+rise.
      const upY = i + 1 < steps ? elevAt(i + 1) : yBase + rise;
      const rl: RampLink = { fromKey: nkey(cell, y), upKey: nkey(step(cell, dir), upY) };
      // The foot row also reaches DOWN to the lower floor at yBase.
      if (i === 0) rl.footKey = nkey(step(cell, opposite(dir)), yBase);
      rampLinks.push(rl);
    }
  }

  // Blocked edges = edges carrying a solid edge block (wall, window, …) across its whole span, scoped
  // to the block's elevation. Only doorways are passable.
  const blocked = new Set<string>();
  for (const p of placements) {
    if (!isGridPlacement(p) || !p.edge || PASSABLE_EDGE.has(p.block)) continue;
    const y = p.y ?? 0;
    const along: Dir = p.edge === "N" || p.edge === "S" ? "E" : "S";
    let cell = p.cell;
    for (let i = 0; i < (p.span ?? 1); i++) {
      blocked.add(ekey(cell, p.edge, y));
      cell = step(cell, along);
    }
  }

  const nodeList = [...floorNodes.values()];
  const ids: NodeId[] = nodeList.map((n) => nkey(n.cell, n.y));
  const indexOf = new Map<string, number>();
  nodeList.forEach((n, i) => indexOf.set(nkey(n.cell, n.y), i));

  // Node positions carry their real elevation (cellCenter sits on y=0; lift it to the floor's `y`).
  const nodes: Vector3[] = nodeList.map((n) => {
    const c = cellCenter(n.cell, tile);
    c.y += n.y;
    return c;
  });
  const edges: [number, number][] = [];

  const isFloor = (cell: Cell, y: number) => indexOf.has(nkey(cell, y));

  // Orthogonal link, within one elevation. Only E (right) and S (down): buildNavMesh treats each edge
  // as two-way, so this covers all four neighbours without duplicating.
  const link = (n: FloorNode, dir: Dir) => {
    const ai = indexOf.get(nkey(n.cell, n.y))!;
    const b = step(n.cell, dir);
    const bi = indexOf.get(nkey(b, n.y));
    if (bi === undefined) return; // neighbour isn't a floor cell at this elevation
    if (blocked.has(ekey(n.cell, dir, n.y))) return; // a wall is in the way
    if (segCovered(n.cell, b, n.y)) return; // furniture sits across this edge
    edges.push([ai, bi]);
  };

  // Diagonal link a -> d (= a + dir1 + dir2), within one elevation. No-corner-cut guard: both
  // "shoulder" cells must be floor, AND none of the FOUR edges meeting at the shared corner may carry
  // a wall. Checking all four (not just the start cell's two) is what stops a diagonal slipping past a
  // *doorway jamb* — the door edge is passable, but the adjacent wall post must still block it.
  const linkDiagonal = (n: FloorNode, dir1: Dir, dir2: Dir) => {
    const { y } = n;
    const ai = indexOf.get(nkey(n.cell, y))!;
    const b = step(n.cell, dir1); // shoulder via dir1
    const c = step(n.cell, dir2); // shoulder via dir2
    const d = step(b, dir2); // d = a + dir1 + dir2
    const di = indexOf.get(nkey(d, y));
    if (di === undefined) return; // the diagonal cell isn't floor
    if (!isFloor(b, y) || !isFloor(c, y)) return; // shoulders must be walkable
    if (
      blocked.has(ekey(n.cell, dir1, y)) || // a–b
      blocked.has(ekey(n.cell, dir2, y)) || // a–c
      blocked.has(ekey(b, dir2, y)) || //      b–d
      blocked.has(ekey(c, dir1, y)) //         c–d
    )
      return;
    if (segCovered(n.cell, d, y)) return; // furniture sits across the diagonal
    edges.push([ai, di]);
  };

  nodeList.forEach((n) => {
    link(n, "E");
    link(n, "S");
    if (diagonals) {
      linkDiagonal(n, "E", "S"); // SE; two-way gives NW from the neighbour
      linkDiagonal(n, "W", "S"); // SW; two-way gives NE from the neighbour
    }
  });

  // Ramp run-direction links (cross-elevation, so the generic same-elevation linker can't make them)
  // plus the foot/head connectors that join the ramp to the floors below and above. Two-way edges, so
  // each uphill link doubles as the downhill one from the neighbour.
  for (const rl of rampLinks) {
    const ai = indexOf.get(rl.fromKey);
    if (ai === undefined) continue;
    const ui = indexOf.get(rl.upKey);
    if (ui !== undefined) edges.push([ai, ui]);
    if (rl.footKey !== undefined) {
      const fi = indexOf.get(rl.footKey);
      if (fi !== undefined) edges.push([ai, fi]);
    }
  }

  // Stairs bridge elevations — the only thing that joins two storeys (otherwise separate components).
  // A `stair` placement at (cell, y) facing `face` (the ascent direction) links its bottom landing
  // node (cell, y) to the top landing node (cell + face, y + rise), if BOTH are floor nodes. The link
  // cost is the true 3-D ramp length (positionOf carries real Y), so A* climbs it sensibly. `rise`
  // defaults to one storey; override per-stair with `params.rise`.
  for (const p of placements) {
    if (!isGridPlacement(p) || p.block !== "stair") continue;
    const y = p.y ?? 0;
    const rise = typeof p.params?.rise === "number" ? p.params.rise : STOREY_RISE;
    const bottom = indexOf.get(nkey(p.cell, y));
    const top = indexOf.get(nkey(step(p.cell, p.face ?? "N"), y + rise));
    if (bottom !== undefined && top !== undefined) edges.push([bottom, top]);
  }

  const navmesh = buildNavMesh(nodes, edges, false, ids);

  // --- path smoothing (string-pulling) ----------------------------------------------------------
  // A* on a grid zig-zags; agents should walk straight where the floor is open. We post-process
  // findPath: greedily skip ahead to the furthest node with LINE OF SIGHT from the current anchor.
  // LOS is an exact DDA over the cells the segment crosses, validated against the GRAPH'S OWN
  // adjacency — which already encodes walls, doorway jambs, corner-cut guards, and furniture
  // carving. A segment passing exactly through a cell corner takes a DIAGONAL step, which requires
  // the diagonal link — so everything the jamb/corner guards forbid stays forbidden when smoothed.
  // findNodePath stays UNSMOOTHED (approachNode and the sims want real graph steps).
  const adjacency = new Set<string>();
  for (const [a, b] of edges) {
    adjacency.add(`${a}|${b}`);
    adjacency.add(`${b}|${a}`);
  }

  const losClear = (ai: number, bi: number): boolean => {
    const A = nodeList[ai];
    const B = nodeList[bi];
    if (A.y !== B.y) return false; // never smooth across elevations (stair hops stay intact)
    let [cx, cz] = A.cell;
    const [txc, tzc] = B.cell;
    const pa = cellCenter(A.cell, tile);
    const pb = cellCenter(B.cell, tile);
    const dx = pb.x - pa.x;
    const dz = pb.z - pa.z;
    const sx = Math.sign(dx);
    const sz = Math.sign(dz);
    let tMaxX = sx !== 0 ? ((cx + sx * 0.5) * tile - pa.x) / dx : Infinity;
    let tMaxZ = sz !== 0 ? ((cz + sz * 0.5) * tile - pa.z) / dz : Infinity;
    const tDx = sx !== 0 ? tile / Math.abs(dx) : Infinity;
    const tDz = sz !== 0 ? tile / Math.abs(dz) : Infinity;
    let prev = ai;
    const EPS = 1e-9;
    let guard = Math.abs(txc - cx) + Math.abs(tzc - cz) + 2;
    while ((cx !== txc || cz !== tzc) && guard-- > 0) {
      if (Math.abs(tMaxX - tMaxZ) < EPS) {
        cx += sx;
        cz += sz;
        tMaxX += tDx;
        tMaxZ += tDz;
      } else if (tMaxX < tMaxZ) {
        cx += sx;
        tMaxX += tDx;
      } else {
        cz += sz;
        tMaxZ += tDz;
      }
      const idx = indexOf.get(nkey([cx, cz], A.y));
      if (idx === undefined || !adjacency.has(`${prev}|${idx}`)) return false;
      prev = idx;
    }
    return cx === txc && cz === tzc;
  };

  const smoothFindPath = (from: NodeId, to: NodeId): Vector3[] => {
    const idPath = navmesh.nav.findNodePath!(from, to);
    if (idPath.length < 2) return idPath.map((id) => navmesh.nav.positionOf(id));
    const idxs = idPath.map((id) => indexOf.get(id as string)!);
    const kept: number[] = [idxs[0]];
    let anchor = 0;
    while (anchor < idxs.length - 1) {
      let j = idxs.length - 1;
      while (j > anchor + 1 && !losClear(idxs[anchor], idxs[j])) j--;
      kept.push(idxs[j]);
      anchor = j;
    }
    return kept.map((i) => {
      const p = cellCenter(nodeList[i].cell, tile);
      p.y += nodeList[i].y;
      return p;
    });
  };

  const nav: Nav = smooth ? { ...navmesh.nav, findPath: smoothFindPath } : navmesh.nav;

  return {
    ...navmesh,
    nav,
    cells: nodeList.map((n) => n.cell),
    nodeAt: (cell, y = 0) => (indexOf.has(nkey(cell, y)) ? nkey(cell, y) : null),
    components: countComponents(nodeList.length, edges),
  };
};

// Number of connected walkable regions, via union-find over the edges. 1 = fully connected; >1 means
// walls or furniture have split the floor into islands an agent can't cross between — the editor
// surfaces this as a warning so you notice when a placement strands part of a room.
const countComponents = (nodeCount: number, edges: [number, number][]): number => {
  if (nodeCount === 0) return 0;
  const parent = Array.from({ length: nodeCount }, (_, i) => i);
  const find = (x: number): number => {
    let root = x;
    while (parent[root] !== root) root = parent[root];
    while (parent[x] !== root) [x, parent[x]] = [parent[x], root]; // path compression
    return root;
  };
  for (const [a, b] of edges) parent[find(a)] = find(b);
  let roots = 0;
  for (let i = 0; i < nodeCount; i++) if (find(i) === i) roots++;
  return roots;
};
