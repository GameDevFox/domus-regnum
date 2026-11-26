import { cottageLevel } from "../blocks/sample-level";

import { MANUAL_NODE_ID } from "../parametric/edit";
import { groupNodes } from "../parametric/group";
import { Binding, DocNode, Measure, ParametricDoc, PropValue } from "../parametric/types";

import { organizedDoc } from "../views/graph-layout"; // pure layout math — bakes node positions

// The Builder's built-in SAMPLE documents — pure `ParametricDoc` data (no editor/runtime deps),
// loaded through the LevelEditorView dropdown and exercised by the parametric eval tests. Lifted out
// of level-editor.ts so that 1900-line factory holds only the editor. The complexity gradient is
// Graph Room (one rect) → Graph Cottage (one furnished room) → Graph Manor (multi-room, fully
// parametric furniture). Graph Cottage/Manor reuse the flat sample levels' ambient glow placements.
// A starter parametric room: one rect driving a floor, a wall perimeter, and a centered table —
// the demo for the node workflow. Resize the rect in the Nodes panel and the room follows.
// Coordinates are world METERS (doc v2), corner-anchored: a 6×5 m room centered on the origin.
export const editorSampleDoc = (): ParametricDoc => organizedDoc({
  name: "Graph Room",
  tile: 0.5,
  nodes: [
    { id: "rect-1", kind: "rect", props: { position: { x: -3, y: 0, z: -2.5 }, size: { x: 6, y: 0, z: 5 } } },
    { id: "floor-1", kind: "floor", props: { rect: { bind: "rect-1" } } },
    { id: "walls-1", kind: "walls", props: { rect: { bind: "rect-1" } } },
    { id: "spawn-1", kind: "spawn", props: { rect: { bind: "rect-1" }, block: "table" } },
  ],
});

// Graph Room, but the perimeter is an author-defined `Walls` COMPONENT (docs/design/18) instead of
// the built-in `walls` kind — the Phase-2 dogfood. The definition simply wraps `walls` (rect →
// walls); the instance `walls-1` references it by name and produces the same geometry, namespaced
// under the instance. Demonstrates resolution + instantiation in the editor.
export const editorComponentDoc = (): ParametricDoc => organizedDoc({
  name: "Component Demo",
  tile: 0.5,
  components: [
    {
      name: "Walls",
      nodes: [
        { id: "region", kind: "input", props: { name: "region", type: "rect" }, ui: { x: 0, y: 40 } },
        { id: "w", kind: "walls", props: { rect: { bind: "region" } }, ui: { x: 240, y: 0 } },
      ],
    },
  ],
  nodes: [
    { id: "rect-1", kind: "rect", props: { position: { x: -3, y: 0, z: -2.5 }, size: { x: 6, y: 0, z: 5 } } },
    { id: "floor-1", kind: "floor", props: { rect: { bind: "rect-1" } } },
    { id: "walls-1", kind: "Walls", props: { region: { bind: "rect-1" } } },
  ],
});

// The Cottage, rebuilt parametrically — the parametric sibling of the flat `cottageLevel`. One small
// room (5.5×4.5 m, NW corner at (−2.75, −2.25), mirroring cottageLevel after centerLevel) drives the
// floor + a culled perimeter with a centered front door (S) and two windows (N + W) wired into
// walls.holes. Every furnishing rides rect-1 DIRECTLY (no sub-rects — it's one room) as a Measure
// of the shell: corner/wall pieces pin to an edge with a fixed inset, the table centers, the chair
// is a fixed offset off the table. Only the ambient ceiling glow stays hand-placed. Coordinates are
// world METERS and reproduce each piece's hand-placed spot at the default size, then reflow on scale.
// --- shared doc-builder helpers (cottage + manor) ----------------------------------------------
// The samples build the same node shapes; these are the common constructors. WALL_COLOR/SHELL_FINISH
// are spread into exterior walls/openings; measures are {scale, offset} against a rect side.
const WALL_COLOR = 0xc9bca6;
const SHELL_FINISH = { thickness: 0.3, cull: true, params: { color: WALL_COLOR } };
const m = (scale: number, offset: number): Measure => ({ scale, offset });
// A perimeter opening (door/window) on rect-1's `side` at `pos`, wired into walls-1.holes by callers.
const shellOpening = (id: string, kind: "door" | "window", side: string, pos: Measure): DocNode => ({
  id,
  kind,
  props: { rect: { bind: "rect-1" }, side, pos, size: { scale: 0, offset: 1 }, ...SHELL_FINISH },
});
// A spot inside `src` as a Measure of it (x against width/world X, z against depth/world Z, NW-anchored).
const rpIn = (id: string, src: string, x: Measure, z: Measure): DocNode => ({
  id,
  kind: "rectPoint",
  props: { rect: { bind: src }, x, z },
});
const placeAt = (
  id: string,
  at: string,
  block: string,
  opts: { face?: string; params?: Record<string, number> } = {},
): DocNode => ({
  id,
  kind: "place",
  props: {
    at: { bind: at },
    block,
    ...(opts.face ? { face: opts.face } : {}),
    ...(opts.params ? { params: opts.params } : {}),
  },
});
const offsetPt = (id: string, a: string, dx: number, dz: number, dy = 0): DocNode => ({
  id,
  kind: "offset",
  props: { a: { bind: a }, delta: { x: dx, y: dy, z: dz } }, // world deltas: x = X, z = Z (floor), y = up
});


// Sits between the trivial "Graph Room" and the multi-room "Graph Manor" in complexity.
export const editorCottageDoc = (): ParametricDoc => {
  const manual = cottageLevel.placements.filter((p) => p.block === "glow");
  // The cottage's spots all measure against the one shell rect.
  const rp = (id: string, x: Measure, z: Measure): DocNode => rpIn(id, "rect-1", x, z);

  return organizedDoc({
    name: "Graph Cottage",
    tile: 0.5,
    nodes: [
      { id: "rect-1", kind: "rect", props: { position: { x: -2.75, y: 0, z: -2.25 }, size: { x: 5.5, y: 0, z: 4.5 } } },
      {
        id: "floor-1",
        kind: "floor",
        props: { rect: { bind: "rect-1" }, params: { color: 0x96764f } },
      },
      {
        id: "walls-1",
        kind: "walls",
        props: {
          rect: { bind: "rect-1" },
          holes: ["door-front", "win-n", "win-w"].map((bind) => ({ bind, output: "opening" })),
          ...SHELL_FINISH,
        },
      },
      // Door + windows all centered on their side — a clean parametric read (the odd-celled flat
      // cottage could only get close).
      { ...shellOpening("door-front", "door", "S", m(0.5, 0)), label: "Front door" },
      shellOpening("win-n", "window", "N", m(0.5, 0)),
      shellOpening("win-w", "window", "W", m(0.5, 0)),

      // ── RESPONSIVE FURNITURE ──────────────────────────────────────────────────────────────
      // Table + rug at room center (just south of middle), with a chair a fixed offset north of it.
      rp("table-pt", m(0.5, 0), m(0.5, 0.5)),
      placeAt("table", "table-pt", "table", { params: { w: 1.2, d: 0.8 } }),
      placeAt("rug", "table-pt", "rug", { params: { w: 2.2, d: 1.6, color: 0x4a5d3a } }),
      offsetPt("chair-off", "table-pt", 0, -1.0),
      placeAt("chair", "chair-off", "chair", { face: "S" }),
      // Edge pieces — each pinned a fixed inset from a shell edge so they hug the walls as it scales.
      rp("fireplace-pt", m(0, 0.25), m(0, 1.25)), // W wall, north end
      placeAt("fireplace", "fireplace-pt", "fireplace", { face: "E" }),
      rp("bed-pt", m(1, -0.75), m(0, 0.75)), // NE
      placeAt("bed", "bed-pt", "bed", { face: "N", params: { w: 0.9, d: 1.6 } }),
      // N wall, ~25% — centered between the west corner and the window. Nudged 0.125 m east of a true
      // quarter so its nav footprint clears the NW corner cell (the W-wall fireplace blocks that corner
      // from the other side; at a flat 25% the two would wall the corner cell off into its own region).
      rp("cabinet-pt", m(0.25, 0.125), m(0, 0.25)),
      placeAt("cabinet", "cabinet-pt", "cabinet", { face: "S" }),
      rp("barrel-pt", m(1, -0.75), m(1, -0.75)), // SE corner
      placeAt("barrel", "barrel-pt", "barrel"),
      rp("plant-pt", m(0, 0.25), m(1, -0.75)), // SW corner
      placeAt("plant", "plant-pt", "plant"),
      rp("lamp-pt", m(0, 1.25), m(1, -0.75)), // toward the SW, off the wall
      placeAt("lamp", "lamp-pt", "lamp", { params: { intensity: 9, distance: 7 } }),
      {
        id: MANUAL_NODE_ID,
        kind: "placements",
        label: "Hand-placed",
        props: { list: manual as unknown as PropValue },
      },
    ],
  });
};

// The Manor, rebuilt parametrically (side-by-side with the hand-placed original): one rect
// drives the floor + a CULLED perimeter (thickness 0.3) whose front door and five windows are
// nodes wired into walls.holes; the north-wing partitions are two-point walls (thickness 0.15)
// with seg-basis doors bound to the SAME points and wired into each wall's holes. Furnishings +
// lighting reuse the flat Manor's placements (already centered) as the manual node, so the two
// stay in sync. Coordinates are world METERS (doc v2, corner-anchored) and mirror manorLevel
// after centerLevel: the 27×17-cell shell is 13.5×8.5 m with its NW corner at (−6.75, −4.25).
//
// This flat factory is the FROZEN TEST FIXTURE (`fixtureManorDoc`): the eval + graph-layout tests
// pin its exact placement ids / graph shape. The Builder's DEFAULT showcase is the room-GROUPED
// `editorManorDoc` below (built from this via `groupNodes`); keep this one stable so regrouping the
// showcase never thrashes the pinned tests.
export const fixtureManorDoc = (): ParametricDoc => {
  // ALL furniture AND the floor lamps are parametric/responsive (built below from the rect), so
  // the manual node is now EMPTY — even the ambient ceiling glows are parametric (one per room,
  // centered via percentage Measures of its sub-rect and raised to the ceiling). Parametric furniture
  // reproduces each piece's EXACT centered position at the default size (nav parity holds); it reflows
  // when the rect scales.
  const part = { thickness: 0.15, params: { color: WALL_COLOR } };
  // A partition doorway bound to the same points as its wall (seg basis) — pos is a Measure
  // along the run, so proportional doors stay centered in their rooms when the manor scales.
  const segDoor = (id: string, a: string, b: string, posScale: number): DocNode => ({
    id,
    kind: "door",
    props: {
      a: { bind: a },
      b: { bind: b },
      pos: { scale: posScale, offset: 0 },
      size: { scale: 0, offset: 1 },
      ...part,
    },
  });
  // Partition endpoints are DYNAMIC rectPoints (not literal points): x resolves against the
  // shell's width, y against its height — move or scale rect-1 and the whole north wing rides
  // along. The dividers sit at thirds; the partition line is a fixed 3 m from the north wall.
  const rectPoint = (id: string, x: Measure, z: Measure | Binding): DocNode => ({
    id,
    kind: "rectPoint",
    props: { rect: { bind: "rect-1" }, x, z },
  });
  const openings = (ids: string[]) => ids.map((bind) => ({ bind, output: "opening" }));

  // --- responsive furniture helpers -------------------------------------------------------------
  // Furniture rides the rect via: deriveRect (carve a room's sub-rect) → rectPoint (a spot inside
  // it, as a Measure of that sub-rect) → place (drop a block there) — plus offset for satellites
  // (chairs). Each measure is {scale, offset}: scale 0/1 pins to a sub-rect edge with `offset`
  // the fixed inset in meters (so corner/wall pieces hold a fixed gap as the room scales), scale
  // 0.5 centers. All values chosen so the DEFAULT size reproduces the hand-placed coords exactly.
  const subRect = (
    id: string,
    src: string,
    x: Measure,
    z: Measure | Binding, // offset along world Z (floor depth)
    width: Measure,
    depth: Measure | Binding, // extent along world Z
  ): DocNode => ({
    id,
    kind: "deriveRect",
    props: { rect: { bind: src }, x, z, width, depth },
  });

  return {
    name: "Graph Manor",
    tile: 0.5,
    nodes: [
      { id: "rect-1", kind: "rect", props: { position: { x: -6.75, y: 0, z: -4.25 }, size: { x: 13.5, y: 0, z: 8.5 } } },
      {
        id: "floor-1",
        kind: "floor",
        props: { rect: { bind: "rect-1" }, params: { color: 0x8a6b4f } },
      },
      {
        id: "walls-1",
        kind: "walls",
        props: {
          rect: { bind: "rect-1" },
          holes: openings(["door-front", "win-study", "win-gallery", "win-bed", "win-w", "win-e"]),
          ...SHELL_FINISH,
        },
      },
      // Front door on the building's central axis. North windows sit at the CENTER of each
      // room's stretch of the wall (the thirds: 1/6, 1/2, 5/6) so they stay centered when the
      // shell scales; the W/E windows center on the HALL stretch below the partition (which
      // starts a fixed 3 m down): center = (3 + h)/2 = {scale: 0.5, offset: 1.5}.
      {
        ...shellOpening("door-front", "door", "S", { scale: 0.5, offset: 0 }),
        label: "Front door",
      },
      shellOpening("win-study", "window", "N", { scale: 1 / 6, offset: 0 }),
      shellOpening("win-gallery", "window", "N", { scale: 1 / 2, offset: 0 }),
      shellOpening("win-bed", "window", "N", { scale: 5 / 6, offset: 0 }),
      shellOpening("win-w", "window", "W", { scale: 0.5, offset: 1.5 }),
      shellOpening("win-e", "window", "E", { scale: 0.5, offset: 1.5 }),
      // North-wing partitions: one long wall with three doorways + two solid dividers, all on
      // DYNAMIC rectPoints — the partition line spans the full width 3 m below the north wall,
      // the dividers stand at thirds, and the doors sit at 1/6, 1/2, 5/6 along the run (the
      // center of each room). Scale or move the shell and the wing reflows proportionally.
      // ── The HALL SPLIT — one knob for where the partition sits ──────────────────────────────
      // A single `measure` of the manor depth: `offset` = metres below the north wall, `scale` =
      // fraction of the depth (or both). Default {0, 3} reproduces the original 3 m strip. It feeds
      // the partition wall, the two dividers' bottoms, the three north-room depths, and the hall's
      // start. The hall's REMAINING depth is its complement {1−scale, −offset}, derived with two
      // `math` (subtract) nodes — so the two bands always sum to the full depth and BOTH reflow when
      // the shell scales (the measures keep scale 0/1; only the offset is shared).
      { id: "hall-split", kind: "measure", label: "Hall split", props: { scale: 0, offset: 3 } },
      {
        id: "hall-rest-scale",
        kind: "math",
        props: { op: "subtract", a: 1, b: { bind: "hall-split", path: "scale" } },
      },
      {
        id: "hall-rest-offset",
        kind: "math",
        props: { op: "subtract", a: 0, b: { bind: "hall-split", path: "offset" } },
      },
      {
        id: "hall-rest",
        kind: "measure",
        label: "Hall depth",
        props: { scale: { bind: "hall-rest-scale" }, offset: { bind: "hall-rest-offset" } },
      },
      rectPoint("pt-h-a", { scale: 0, offset: 0 }, { bind: "hall-split" }),
      rectPoint("pt-h-b", { scale: 1, offset: 0 }, { bind: "hall-split" }),
      {
        id: "wall-h",
        kind: "wall",
        props: {
          a: { bind: "pt-h-a" },
          b: { bind: "pt-h-b" },
          holes: openings(["door-study", "door-gallery", "door-bed"]),
          ...part,
        },
      },
      segDoor("door-study", "pt-h-a", "pt-h-b", 1 / 6),
      segDoor("door-gallery", "pt-h-a", "pt-h-b", 1 / 2),
      segDoor("door-bed", "pt-h-a", "pt-h-b", 5 / 6),
      rectPoint("pt-v1-a", { scale: 1 / 3, offset: 0 }, { scale: 0, offset: 0 }),
      rectPoint("pt-v1-b", { scale: 1 / 3, offset: 0 }, { bind: "hall-split" }),
      {
        id: "wall-v1",
        kind: "wall",
        props: { a: { bind: "pt-v1-a" }, b: { bind: "pt-v1-b" }, ...part },
      },
      rectPoint("pt-v2-a", { scale: 2 / 3, offset: 0 }, { scale: 0, offset: 0 }),
      rectPoint("pt-v2-b", { scale: 2 / 3, offset: 0 }, { bind: "hall-split" }),
      {
        id: "wall-v2",
        kind: "wall",
        props: { a: { bind: "pt-v2-a" }, b: { bind: "pt-v2-b" }, ...part },
      },
      // ── RESPONSIVE FURNITURE ──────────────────────────────────────────────────────────────
      // Four room sub-rects carved from the shell: the north wing is the 3 m strip below the top
      // wall, split in thirds (study | gallery | bedchamber); the hall is everything below the
      // partition. Each room's furniture is a Measure of ITS sub-rect, so it reflows when the
      // shell (and thus the sub-rect) scales.
      subRect("study-rect", "rect-1", m(0, 0), m(0, 0), m(1 / 3, 0), { bind: "hall-split" }),
      subRect("gallery-rect", "rect-1", m(1 / 3, 0), m(0, 0), m(1 / 3, 0), { bind: "hall-split" }),
      subRect("bed-rect", "rect-1", m(2 / 3, 0), m(0, 0), m(1 / 3, 0), { bind: "hall-split" }),
      subRect("hall-rect", "rect-1", m(0, 0), { bind: "hall-split" }, m(1, 0), { bind: "hall-rest" }),

      // Great hall: table + rug at the hall center; 4 chairs a FIXED offset away (they keep
      // their spacing as the hall scales, not spread apart).
      rpIn("hall-pt", "hall-rect", m(0.5, 0), m(0.5, 0)),
      placeAt("hall-table", "hall-pt", "table", { params: { w: 1.6, d: 0.9 } }),
      placeAt("hall-rug", "hall-pt", "rug", { params: { w: 3.0, d: 2.2, color: 0x6e2f2f } }),
      ...[
        [0, -0.5, "S"],
        [0, 0.5, "N"],
        [-1.0, 0, "E"],
        [1.0, 0, "W"],
      ].flatMap(([dx, dz, face], i): DocNode[] => [
        offsetPt(`hall-chair-${i}-off`, "hall-pt", dx as number, dz as number),
        placeAt(`hall-chair-${i}`, `hall-chair-${i}-off`, "chair", { face: face as string }),
      ]),
      // Hall edge pieces — corner-pinned (fixed inset from a hall edge) so they hug the walls.
      placeAt("hall-fireplace", "hall-fireplace-pt", "fireplace", { face: "S" }),
      // Centered between the west and center partition doorways (those sit at 1/6 and 1/2, so their
      // midpoint is 1/3) — a pure PERCENTAGE, no fixed offset, so it holds that midpoint as the hall
      // widens instead of drifting off to one side.
      rpIn("hall-fireplace-pt", "hall-rect", m(1 / 3, 0), m(0, 0.25)),
      rpIn("hall-plantW-pt", "hall-rect", m(0, 1.25), m(0, 1.25)),
      placeAt("hall-plantW", "hall-plantW-pt", "plant"),
      rpIn("hall-plantE-pt", "hall-rect", m(1, -1.25), m(0, 1.25)),
      placeAt("hall-plantE", "hall-plantE-pt", "plant"),
      rpIn("hall-barrel-pt", "hall-rect", m(1, -1.75), m(1, -1.75)),
      placeAt("hall-barrel", "hall-barrel-pt", "barrel"),
      rpIn("hall-colW-pt", "hall-rect", m(0, 0.75), m(1, -0.75)),
      placeAt("hall-colW", "hall-colW-pt", "column", { params: { height: 2.4 } }),
      rpIn("hall-colE-pt", "hall-rect", m(1, -0.75), m(1, -0.75)),
      placeAt("hall-colE", "hall-colE-pt", "column", { params: { height: 2.4 } }),
      // Floor lamps — a matched pair pinned 1.75 m from each side wall, 1.25 m up from the south
      // wall, so they flank the hall symmetrically and spread with it as it widens.
      rpIn("hall-lampW-pt", "hall-rect", m(0, 1.75), m(1, -1.25)),
      placeAt("hall-lampW", "hall-lampW-pt", "lamp", { params: { intensity: 10, distance: 9 } }),
      rpIn("hall-lampE-pt", "hall-rect", m(1, -1.75), m(1, -1.25)),
      placeAt("hall-lampE", "hall-lampE-pt", "lamp", { params: { intensity: 10, distance: 9 } }),
      // Ambient ceiling glow, centered in the hall (percentage Measure) and raised to the ceiling.
      rpIn("hall-glow-pt", "hall-rect", m(0.5, 0), m(0.5, 0)),
      offsetPt("hall-glow-up", "hall-glow-pt", 0, 0, 3),
      placeAt("hall-glow", "hall-glow-up", "glow", { params: { intensity: 4, distance: 22 } }),

      // Study (NW): a small table tucked toward the NW corner with a chair below it; a cabinet
      // against the north wall and a plant in the SW corner.
      rpIn("study-table-pt", "study-rect", m(0, 1.25), m(0, 0.75)),
      placeAt("study-table", "study-table-pt", "table", { params: { w: 1.1, d: 0.6 } }),
      offsetPt("study-chair-off", "study-table-pt", 0, 0.5),
      placeAt("study-chair", "study-chair-off", "chair", { face: "N" }),
      rpIn("study-cab-pt", "study-rect", m(1, -1.25), m(0, 0.25)),
      placeAt("study-cab", "study-cab-pt", "cabinet", { face: "S" }),
      rpIn("study-plant-pt", "study-rect", m(0, 0.75), m(1, -0.75)),
      placeAt("study-plant", "study-plant-pt", "plant"),
      rpIn("study-glow-pt", "study-rect", m(0.5, 0), m(0.5, 0)),
      offsetPt("study-glow-up", "study-glow-pt", 0, 0, 3),
      placeAt("study-glow", "study-glow-up", "glow", { params: { intensity: 2.5, distance: 11 } }),

      // Gallery (N middle): two plants flanking the doorway.
      rpIn("gal-plantW-pt", "gallery-rect", m(0, 0.75), m(0, 0.75)),
      placeAt("gal-plantW", "gal-plantW-pt", "plant"),
      rpIn("gal-plantE-pt", "gallery-rect", m(1, -0.75), m(0, 0.75)),
      placeAt("gal-plantE", "gal-plantE-pt", "plant"),
      rpIn("gal-glow-pt", "gallery-rect", m(0.5, 0), m(0.5, 0)),
      offsetPt("gal-glow-up", "gal-glow-pt", 0, 0, 3),
      placeAt("gal-glow", "gal-glow-up", "glow", { params: { intensity: 2.5, distance: 12 } }),

      // Bedchamber (NE): bed centered against the north wall, a wardrobe beside it, a plant in
      // the SE corner.
      rpIn("bed-pt", "bed-rect", m(0.5, 0), m(0, 1.25)),
      placeAt("bed", "bed-pt", "bed", { face: "S", params: { w: 1.0, d: 1.8 } }),
      rpIn("bed-cab-pt", "bed-rect", m(0, 0.75), m(0, 0.25)),
      placeAt("bed-cab", "bed-cab-pt", "cabinet", { face: "S" }),
      rpIn("bed-plant-pt", "bed-rect", m(1, -0.75), m(1, -0.75)),
      placeAt("bed-plant", "bed-plant-pt", "plant"),
      rpIn("bed-glow-pt", "bed-rect", m(0.5, 0), m(0.5, 0)),
      offsetPt("bed-glow-up", "bed-glow-pt", 0, 0, 3),
      placeAt("bed-glow", "bed-glow-up", "glow", { params: { intensity: 2.5, distance: 11 } }),
      {
        id: MANUAL_NODE_ID,
        kind: "placements",
        label: "Hand-placed",
        props: { list: [] as unknown as PropValue },
      },
    ],
  };
};

// ── The room-GROUPED Graph Manor: the Builder's DEFAULT showcase ──────────────────────────────
// Each room's furniture (rectPoints + placed blocks) is folded into a furniture-only component via
// the tested, output-preserving `groupNodes` op. The room's `deriveRect` stays at ROOT and is fed in
// as the component's single `rect` input — a room knows only its own rect, not the manor (Law of
// Demeter), so the components stay reusable and the root holds the layout. Shell, partitions, openings
// and the four sub-rects are top-level; each room emits only auto-aggregated placements (no custom
// outputs). Geometry is identical to `fixtureManorDoc` — purely a tidier graph, collapsing ~71 flat
// nodes to ~30 (shell + 4 sub-rects + 4 room instances).
const MANOR_ROOMS: { name: string; label: string; ids: string[] }[] = [
  {
    name: "StudyRoom",
    label: "Study",
    ids: ["study-table-pt", "study-table", "study-chair-off", "study-chair",
      "study-cab-pt", "study-cab", "study-plant-pt", "study-plant",
      "study-glow-pt", "study-glow-up", "study-glow"],
  },
  {
    name: "GalleryRoom",
    label: "Gallery",
    ids: ["gal-plantW-pt", "gal-plantW", "gal-plantE-pt", "gal-plantE",
      "gal-glow-pt", "gal-glow-up", "gal-glow"],
  },
  {
    name: "BedChamber",
    label: "Bedchamber",
    ids: ["bed-pt", "bed", "bed-cab-pt", "bed-cab", "bed-plant-pt", "bed-plant",
      "bed-glow-pt", "bed-glow-up", "bed-glow"],
  },
  {
    name: "GreatHall",
    label: "Great Hall",
    ids: ["hall-pt", "hall-table", "hall-rug",
      "hall-chair-0-off", "hall-chair-0", "hall-chair-1-off", "hall-chair-1",
      "hall-chair-2-off", "hall-chair-2", "hall-chair-3-off", "hall-chair-3",
      "hall-fireplace", "hall-fireplace-pt", "hall-plantW-pt", "hall-plantW",
      "hall-plantE-pt", "hall-plantE", "hall-barrel-pt", "hall-barrel",
      "hall-colW-pt", "hall-colW", "hall-colE-pt", "hall-colE",
      "hall-lampW-pt", "hall-lampW", "hall-lampE-pt", "hall-lampE",
      "hall-glow-pt", "hall-glow-up", "hall-glow"],
  },
];

export const editorManorDoc = (): ParametricDoc =>
  organizedDoc(MANOR_ROOMS.reduce((d, r) => groupNodes(d, r.ids, r.name, r.label), fixtureManorDoc()));

