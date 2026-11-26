import { free, level, onCell, room } from "./author";
import { addWallCorners, centerLevel } from "./edit";
import { Dir } from "./grid";
import { OUTWARD_VIEW, VIEW_SIDE } from "./properties";
import { BlockParams, isGridPlacement, Placement } from "./types";

// Hand-authored sample levels. tile = 0.5 m — a cell is roughly one person's footprint (see
// docs/design/08-scale-and-architecture.md). Cell coordinates are therefore ~2× what they'd be on a
// 1 m grid; free placements (`pos`) and furniture sizes stay in true meters. Furniture is spaced so
// the derived navmesh stays one connected region at the 0.25 m carve buffer (see footprint.ts) — the
// `manorLevel is fully connected` test guards this.

const WALL = { color: 0xc9bca6, thickness: 0.3 }; // exterior / load-bearing
const INTERIOR = { color: 0xc9bca6, thickness: 0.15 }; // internal partition
const FLOOR = { color: 0x8a6b4f };

// Make a room shell's PERIMETER one-sided: each exterior edge block (wall / window / door) renders
// only from INSIDE the house, so the near side drops away when you look in (see view-cull.ts). The
// door + windows cut into a wall cull with it, or they'd float once the wall vanished. The per-side
// map lives in properties.ts (OUTWARD_VIEW — shared with the parametric kinds' `cull` option).
const facingOut = (placements: Placement[]): Placement[] =>
  placements.map((p) =>
    isGridPlacement(p) && p.edge
      ? { ...p, params: { ...p.params, [VIEW_SIDE]: OUTWARD_VIEW[p.edge] } }
      : p,
  );

// A straight run of interior wall along one edge across a row (H) or down a col (V), with a
// SINGLE-CELL doorway at each given index. Span-1 doors sit over one cell, so the navmesh has one
// node — and therefore one clear, centered pathway — through each opening (a span-2 door straddles
// the boundary between two nodes, opening two parallel crossings).
const wallRun = (
  fixed: number,
  from: number,
  to: number,
  edge: Dir,
  axis: "H" | "V",
  doors: number[],
  params: BlockParams,
): Placement[] => {
  const out: Placement[] = [];
  for (let i = from; i <= to; i++) {
    const cell: [number, number] = axis === "H" ? [i, fixed] : [fixed, i];
    if (doors.includes(i)) {
      // Span-1 → one centred pathway; `wide` widens the visual opening (flanking walls trimmed below).
      out.push({ block: "doorway", cell, edge, params: { ...params, wide: true } });
    } else {
      const doorStart = doors.includes(i - 1); // wide door on the −run side
      const doorEnd = doors.includes(i + 1); //   wide door on the +run side
      out.push({
        block: "wall",
        cell,
        edge,
        params: doorStart || doorEnd ? { ...params, doorStart, doorEnd } : params,
      });
    }
  }
  return out;
};

// The manor: a 27×17-cell shell (= 13.5×8.5 m). ODD dimensions on purpose — the centre of an odd run
// is a node, so `centerLevel` puts the building's middle cell on the world origin and every door can
// be a single-cell (span-1) opening centred on a node. A spacious great hall fills the south; three
// rooms (study · gallery · bedchamber, each 9 cells = 4.5 m wide) line the north wing. The front door
// (col 13) and the gallery door (col 13) share the building's central axis.
const shell = facingOut(
  room({
    x: 0,
    y: 0,
    w: 27,
    h: 17,
    floorParams: FLOOR,
    wallParams: WALL,
    doors: [
      { side: "S", at: 13 }, // front door — span 1, on the centre node
      { side: "N", at: 3, span: 2, block: "window", params: WALL }, // study window
      { side: "N", at: 13, span: 2, block: "window", params: WALL }, // gallery window
      { side: "N", at: 22, span: 2, block: "window", params: WALL }, // bedchamber window
      { side: "W", at: 10, span: 2, block: "window", params: WALL }, // hall west window
      { side: "E", at: 10, span: 2, block: "window", params: WALL }, // hall east window
    ],
  }),
);

// North-wing partitions. The horizontal wall (S edge of row 5) separates the wing from the hall, with
// a span-1 doorway centred in each room (cols 4 · 13 · 22); two solid vertical walls divide them.
const partitions: Placement[] = [
  ...wallRun(5, 0, 26, "S", "H", [4, 13, 22], INTERIOR), // hall ↔ study/gallery/bedchamber doors
  ...wallRun(9, 0, 5, "W", "V", [], INTERIOR), // study | gallery
  ...wallRun(18, 0, 5, "W", "V", [], INTERIOR), // gallery | bedchamber
];

// Furnishings — kept off the doorways so the navmesh stays one region (the dining set sits on the
// central axis; circulation goes around it to either side).
const furnishings: Placement[] = [
  // Great hall — central dining set, hearth on the west wall, symmetric decor.
  free("rug", [6.5, 0, 5.5], { params: { w: 3.0, d: 2.2, color: 0x6e2f2f } }), // under the table ([13,11])
  onCell("table", [13, 11], { params: { w: 1.6, d: 0.9 } }),
  onCell("chair", [13, 10], { face: "S" }),
  onCell("chair", [13, 12], { face: "N" }),
  onCell("chair", [11, 11], { face: "E" }),
  onCell("chair", [15, 11], { face: "W" }),
  // Hearth out in the hall, facing south — placed FREE at x = 4.25 (world −2.25) so it sits exactly
  // centered between the west and centre partition doorways (the parametric manor matches this).
  free("fireplace", [4.25, 0, 3], { rotY: 0 }),
  onCell("plant", [2, 8]),
  onCell("plant", [24, 8]),
  onCell("barrel", [23, 13]),
  onCell("column", [1, 15], { params: { height: 2.4 } }),
  onCell("column", [25, 15], { params: { height: 2.4 } }),
  // Study (NW) — writing desk + bookshelf against the walls.
  onCell("table", [2, 1], { params: { w: 1.1, d: 0.6 } }),
  onCell("chair", [2, 2], { face: "N" }),
  onCell("cabinet", [6, 0], { face: "S" }),
  onCell("plant", [1, 4]),
  // Gallery (centre) — open passage on the axis; greenery to the sides.
  onCell("plant", [10, 1]),
  onCell("plant", [16, 1]),
  // Bedchamber (NE) — bed against the north wall, a wardrobe flush to the wall (so it leaves no
  // stranded pocket behind it in the corner).
  onCell("bed", [22, 2], { face: "S", params: { w: 1.0, d: 1.8 } }),
  onCell("cabinet", [19, 0], { face: "S" }),
  onCell("plant", [25, 4]),
];

// Lighting — free placements in world meters; enough lamps/fill to read the plan.
const lighting: Placement[] = [
  free("lamp", [3, 0, 7], { params: { intensity: 11, distance: 9 } }), // hall west
  free("lamp", [10, 0, 7.5], { params: { intensity: 10, distance: 9, color: 0xffcf8a } }), // hall east
  free("glow", [6.5, 3, 5.5], { params: { intensity: 4, distance: 22 } }), // hall fill
  free("glow", [2, 3, 1], { params: { intensity: 2.5, distance: 11 } }), // study
  free("glow", [6.5, 3, 1], { params: { intensity: 2.5, distance: 12 } }), // gallery
  free("glow", [11, 3, 1], { params: { intensity: 2.5, distance: 11 } }), // bedchamber
];

export const manorLevel = centerLevel(
  addWallCorners(
    level(
      "Manor — Hall, Study, Gallery & Bedchamber",
      0.5,
      shell,
      partitions,
      furnishings,
      lighting,
    ),
  ),
);

// A smaller one-room cottage: 11×9 cells (= 5.5×4.5 m). Odd dims again, so the south door sits on the
// centre node.
const cottageShell = room({
  x: 0,
  y: 0,
  w: 11,
  h: 9,
  floorParams: { color: 0x96764f },
  wallParams: WALL,
  doors: [
    { side: "S", at: 5 }, // front door — span 1, on the centre node
    { side: "N", at: 5, span: 2, block: "window", params: WALL },
    { side: "W", at: 4, span: 2, block: "window", params: WALL },
  ],
});

const cottageFurnishings: Placement[] = [
  free("rug", [2.5, 0, 2.5], { params: { w: 2.2, d: 1.6, color: 0x4a5d3a } }),
  onCell("fireplace", [0, 2], { face: "E" }),
  onCell("bed", [9, 1], { face: "N", params: { w: 0.9, d: 1.6 } }),
  onCell("table", [5, 5], { params: { w: 1.2, d: 0.8 } }),
  onCell("chair", [5, 3], { face: "S" }),
  // N wall at ~25% (world −1.25, between the west corner and the centred window) — placed FREE since
  // it lands off-grid; the parametric cottage matches this. Nudged 0.125 m east of a true quarter so
  // its nav footprint clears the NW corner cell (boxed in otherwise by the W-wall fireplace). Faces S.
  free("cabinet", [1.25, 0, 0], { rotY: 0 }),
  onCell("barrel", [9, 7]),
  onCell("plant", [0, 7]),
  free("lamp", [1, 0, 3.5], { params: { intensity: 9, distance: 7 } }),
  free("glow", [2.5, 3, 2], { params: { intensity: 3, distance: 12 } }),
];

export const cottageLevel = centerLevel(
  addWallCorners(level("Cottage", 0.5, cottageShell, cottageFurnishings)),
);
