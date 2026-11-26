import { describe, expect, it } from "vitest";

import { floorArea, floorRect, level } from "./author";
import { buildLevelNav } from "./level-nav";
import { cottageLevel, manorLevel } from "./sample-level";
import { Placement } from "./types";

// A 1×2 strip of floor (cells [0,0] and [0,1]) with a configurable block on the shared S edge of
// [0,0]. The two cells are connected unless a solid wall divides them.
const strip = (divider?: Placement) =>
  level("strip", 1, floorRect(0, 0, 1, 2), divider ? [divider] : []);

describe("buildLevelNav", () => {
  it("creates one walkable node per floor cell, keyed by its c,r,y coordinate", () => {
    const ln = buildLevelNav(strip());
    expect(ln.nodes).toHaveLength(2);
    expect(ln.nodeAt([0, 0])).toBe("0,0,0"); // node id IS the coordinate
    expect(ln.nodeAt([0, 1])).toBe("0,1,0");
    expect(ln.nodeAt([5, 5])).toBeNull(); // not a floor cell
  });

  it("connects adjacent floor cells when nothing divides them", () => {
    const ln = buildLevelNav(strip());
    const path = ln.nav.findPath(ln.nodeAt([0, 0])!, ln.nodeAt([0, 1])!);
    expect(path).toHaveLength(2); // direct neighbours
  });

  it("expands a region floor (size [w,h]) into one walkable node per covered cell", () => {
    const ln = buildLevelNav(level("region", 1, floorArea(0, 0, 3, 2))); // one merged 3×2 floor
    expect(ln.nodes).toHaveLength(6); // a node for every cell in the rectangle
    expect(ln.nodeAt([0, 0])).toBe("0,0,0");
    expect(ln.nodeAt([2, 1])).toBe("2,1,0"); // far corner of the region
    expect(ln.components).toBe(1); // fully connected — agents path across the merged floor
    const path = ln.nav.findPath(ln.nodeAt([0, 0])!, ln.nodeAt([2, 1])!);
    expect(path.length).toBeGreaterThan(1);
  });

  it("blocks the path when a wall sits on the shared edge", () => {
    const ln = buildLevelNav(strip({ block: "wall", cell: [0, 0], edge: "S" }));
    const path = ln.nav.findPath(ln.nodeAt([0, 0])!, ln.nodeAt([0, 1])!);
    expect(path.length).toBeLessThan(2); // unreachable — no other route in a 1-wide strip
  });

  it("keeps the path open through a doorway", () => {
    const ln = buildLevelNav(strip({ block: "doorway", cell: [0, 0], edge: "S" }));
    const path = ln.nav.findPath(ln.nodeAt([0, 0])!, ln.nodeAt([0, 1])!);
    expect(path).toHaveLength(2); // doorways are passable
  });

  it("does not cut a wall corner — 8-way detours like 4-way", () => {
    // A 2×2 room with a wall on the S edge of [0,0]. Every diagonal that would reach [0,1] grazes
    // that wall's corner, so 8-way must detour through [1,0],[1,1] (4 nodes), same as 4-way.
    const lvl = level("room2x2", 1, floorRect(0, 0, 2, 2), [
      { block: "wall", cell: [0, 0], edge: "S" },
    ]);
    const fourWay = buildLevelNav(lvl, { diagonals: false });
    expect(fourWay.nav.findPath(fourWay.nodeAt([0, 0])!, fourWay.nodeAt([0, 1])!)).toHaveLength(4);
    const eightWay = buildLevelNav(lvl); // diagonals default on
    expect(eightWay.nav.findPath(eightWay.nodeAt([0, 0])!, eightWay.nodeAt([0, 1])!)).toHaveLength(
      4,
    );
  });

  it("moves diagonally across open floor (8-way)", () => {
    const ln = buildLevelNav(level("open", 1, floorRect(0, 0, 2, 2)));
    // [0,0] and [1,1] are diagonally adjacent → one hop with diagonals.
    expect(ln.nav.findPath(ln.nodeAt([0, 0])!, ln.nodeAt([1, 1])!)).toHaveLength(2);
  });

  it("does not let a diagonal slip past a doorway jamb", () => {
    // A 3×2 strip split by a wall, with a doorway in the middle ([1,0] S edge). Inside (top row) and
    // outside (bottom row) connect ONLY through that door — a diagonal must not graze the jamb posts.
    const ln = buildLevelNav(
      level("door", 1, floorRect(0, 0, 3, 2), [
        { block: "wall", cell: [0, 0], edge: "S" }, // left jamb
        { block: "doorway", cell: [1, 0], edge: "S" }, // the door
        { block: "wall", cell: [2, 0], edge: "S" }, // right jamb
      ]),
    );
    // [0,0] (inside-left) to [0,1] (outside-left): must go through the door [1,0]->[1,1], not cut
    // the left jamb via a [1,0]->[0,1] diagonal. That forces 4 nodes; a jamb-cut would be 3.
    const path = ln.nav.findPath(ln.nodeAt([0, 0])!, ln.nodeAt([0, 1])!);
    expect(path).toHaveLength(4);
  });

  it("does not let a diagonal cut through a wall corner", () => {
    // Box [0,0] in with walls on its E and S edges. Its orthogonal neighbours are gone; only a
    // diagonal could escape — the corner-cut guard must forbid it, leaving [0,0] stranded.
    const ln = buildLevelNav(
      level("boxed", 1, floorRect(0, 0, 2, 2), [
        { block: "wall", cell: [0, 0], edge: "E" },
        { block: "wall", cell: [0, 0], edge: "S" },
      ]),
    );
    const path = ln.nav.findPath(ln.nodeAt([0, 0])!, ln.nodeAt([1, 1])!);
    expect(path.length).toBeLessThan(2); // unreachable — the diagonal can't slip through the corner
  });

  // --- furniture carving (tile 1 so the 0.45 m buffer stays within the obstacle's own cell) -------

  it("carves the node a piece of furniture sits on, and leaves it when furniture is off", () => {
    const lvl = level("room", 1, floorRect(0, 0, 3, 3), [{ block: "chair", cell: [1, 1] }]);
    const carved = buildLevelNav(lvl); // furniture on by default
    expect(carved.nodeAt([1, 1])).toBeNull();
    expect(carved.nodes).toHaveLength(8); // 9 floor cells − the chair's cell
    expect(carved.components).toBe(1); // the ring around it stays connected

    const off = buildLevelNav(lvl, { furniture: false });
    expect(off.nodeAt([1, 1])).not.toBeNull();
    expect(off.nodes).toHaveLength(9);
  });

  it("reports a disconnection when furniture splits the floor into islands", () => {
    // A 1-wide hallway with a cabinet blocking the middle cell — the two ends can't reach each other.
    const lvl = level("hall", 1, floorRect(0, 0, 1, 3), [{ block: "cabinet", cell: [0, 1] }]);
    const ln = buildLevelNav(lvl);
    expect(ln.nodeAt([0, 1])).toBeNull();
    expect(ln.components).toBe(2); // two stranded ends → the editor warns
  });

  it("reports a single component for a connected room", () => {
    expect(buildLevelNav(level("open", 1, floorRect(0, 0, 3, 3))).components).toBe(1);
  });

  it("a free DIAGONAL wall (footprintW) carves the cells/edges its rotated rect crosses", () => {
    // The parametric two-point `wall` emits a FREE placement with an explicit footprint — a
    // diagonal across a 5×5 room must split it (free walls can't block grid edges directly).
    const diagonal: Placement = {
      block: "wall",
      pos: [2, 0, 2], // room center
      rotY: Math.atan2(-1, 1), // 45°: from (0,0) toward (4,4)
      params: { footprintW: Math.hypot(4, 4) + 1 }, // spans the room corner to corner
    };
    const ln = buildLevelNav(level("diag", 1, floorRect(0, 0, 5, 5), [diagonal]));
    expect(ln.nodeAt([2, 2])).toBeNull(); // the wall stands across the center cell
    expect(ln.components).toBe(2); // the two triangular halves can't reach each other

    // The same free wall WITHOUT footprintW carves nothing (grid walls never set it — their
    // edge blocking handles them).
    const inert: Placement = { block: "wall", pos: [2, 0, 2], rotY: diagonal.rotY };
    const off = buildLevelNav(level("plain", 1, floorRect(0, 0, 5, 5), [inert]));
    expect(off.nodes).toHaveLength(25);
    expect(off.components).toBe(1);
  });

  it("a free PARTITION on a cell boundary blocks crossings without carving the rooms beside it", () => {
    // Wall footprints carve with NO clearance buffer (walls aren't furniture — bodies hug them
    // exactly as they hug grid-edge walls). With the furniture buffer, a thin partition lying on a
    // cell boundary would cover the cell centers on BOTH sides and sever every room it borders.
    const wall = (cx: number, w: number): Placement => ({
      block: "wall",
      pos: [cx, 0, 1.5], // the boundary between rows 1 and 2 (tile 1: centers at integers)
      rotY: 0,
      params: { footprintW: w, thickness: 0.15 },
    });
    const solid = buildLevelNav(level("part", 1, floorRect(0, 0, 4, 4), [wall(1.5, 4)]));
    expect(solid.nodes).toHaveLength(16); // no cells carved — only crossings blocked
    expect(solid.components).toBe(2);

    // Split into two segments with a 1 m doorway gap over column 1 — the gap connects the halves.
    const door = buildLevelNav(level("door", 1, floorRect(0, 0, 4, 4), [wall(0, 1), wall(2.5, 2)]));
    expect(door.nodes).toHaveLength(16);
    expect(door.components).toBe(1);
  });

  it("a free WINDOW fill (footprintW) blocks passage through its wall gap", () => {
    // The parametric `window` kind's fill is a free placement on the wall line — it must stop
    // agents walking through the glazing, like a grid-edge window blocks its edge.
    const glazed = strip({
      block: "window",
      pos: [0, 0, 0.5],
      rotY: 0,
      params: { footprintW: 1, thickness: 0.2 },
    });
    const ln = buildLevelNav(glazed);
    expect(ln.nodes).toHaveLength(2); // neither cell carved
    expect(ln.nav.findPath(ln.nodeAt([0, 0])!, ln.nodeAt([0, 1])!).length).toBeLessThan(2);
  });

  it("keeps the sample manor and cottage fully walkable with furniture carved (one region each)", () => {
    // Guards the authored layouts: furniture is placed off the doorways/circulation so the 0.25 m
    // carve never strands a room. If a furniture edit splits the floor this fails (and the editor's
    // Nav overlay would show the warning).
    expect(buildLevelNav(manorLevel).components).toBe(1);
    expect(buildLevelNav(cottageLevel).components).toBe(1);
  });

  // --- multi-level (cell, y) nodes ----------------------------------------------------------------

  it("stacks floors: the same cell at different elevations is a distinct node", () => {
    // A 2×1 ground strip with a 2×1 strip directly above it at y = 3.3 (a second storey, no stairs).
    const lvl = level(
      "stacked",
      1,
      floorRect(0, 0, 2, 1),
      floorRect(0, 0, 2, 1).map((p) => ({ ...p, y: 3.3 })),
    );
    const ln = buildLevelNav(lvl);
    expect(ln.nodes).toHaveLength(4); // both floors kept — the upper tiles don't evict the lower
    expect(ln.nodeAt([0, 0])).toBe("0,0,0");
    expect(ln.nodeAt([0, 0], 3.3)).toBe("0,0,3.3");
    // Adjacent tiles on the SAME floor connect…
    expect(ln.nav.findPath(ln.nodeAt([0, 0])!, ln.nodeAt([1, 0])!)).toHaveLength(2);
    expect(ln.nav.findPath(ln.nodeAt([0, 0], 3.3)!, ln.nodeAt([1, 0], 3.3)!)).toHaveLength(2);
    // …but the two storeys are separate islands (no stair yet) and can't reach each other.
    expect(ln.components).toBe(2);
    expect(ln.nav.findPath(ln.nodeAt([0, 0])!, ln.nodeAt([0, 0], 3.3)!).length).toBeLessThan(2);
  });

  it("gives each node its real elevation in world space", () => {
    const lvl = level("up", 1, [{ block: "floor", cell: [0, 0], y: 3.3 }]);
    const ln = buildLevelNav(lvl);
    expect(ln.nav.positionOf(ln.nodeAt([0, 0], 3.3)!).y).toBeCloseTo(3.3);
  });

  it("carves furniture only on its own floor, not the one below it", () => {
    // A chair upstairs must not punch a hole in the floor directly beneath it.
    const lvl = level("twofloor", 1, [
      { block: "floor", cell: [0, 0] },
      { block: "floor", cell: [0, 0], y: 3.3 },
      { block: "chair", cell: [0, 0], y: 3.3 },
    ]);
    const ln = buildLevelNav(lvl);
    expect(ln.nodeAt([0, 0])).not.toBeNull(); // ground tile survives
    expect(ln.nodeAt([0, 0], 3.3)).toBeNull(); // upstairs tile carved by the chair
  });

  it("a stair bridges two stacked floors into one component, routable up", () => {
    const lvl = level(
      "stair",
      1,
      floorRect(0, 0, 2, 1), // ground [0,0],[1,0] at y 0
      floorRect(0, 0, 2, 1).map((p) => ({ ...p, y: 3.3 })), // upper [0,0],[1,0] at y 3.3
      [{ block: "stair", cell: [0, 0], face: "E" }], // ascends E → top landing [1,0] @ 3.3
    );
    const ln = buildLevelNav(lvl);
    expect(ln.components).toBe(1); // the stair joins the two storeys
    const path = ln.nav.findPath(ln.nodeAt([0, 0], 0)!, ln.nodeAt([0, 0], 3.3)!);
    expect(path.length).toBeGreaterThan(1); // floor 0 → floor 1 is routable via the stair
  });

  it("a stair with no top-landing tile leaves the storeys disconnected", () => {
    const lvl = level(
      "stair-nowhere",
      1,
      floorRect(0, 0, 2, 1),
      floorRect(0, 0, 2, 1).map((p) => ({ ...p, y: 3.3 })),
      [{ block: "stair", cell: [1, 0], face: "E" }], // top landing would be [2,0] @ 3.3 — no tile
    );
    expect(buildLevelNav(lvl).components).toBe(2);
  });
});

describe("path smoothing (string-pulling)", () => {
  it("straightens an open corridor to its endpoints (findNodePath stays raw)", () => {
    const ln = buildLevelNav(level("corridor", 1, floorRect(0, 0, 1, 5)));
    const from = ln.nodeAt([0, 0])!;
    const to = ln.nodeAt([0, 4])!;
    expect(ln.nav.findPath(from, to)).toHaveLength(2); // straight line, no intermediate stops
    expect(ln.nav.findNodePath!(from, to)).toHaveLength(5); // the graph steps are untouched
  });

  it("cuts across an open room as one straight diagonal", () => {
    const ln = buildLevelNav(level("open", 1, floorRect(0, 0, 5, 5)));
    const path = ln.nav.findPath(ln.nodeAt([0, 0])!, ln.nodeAt([4, 3])!);
    expect(path).toHaveLength(2); // any-angle, not stair-stepped
  });

  it("keeps the bend when a wall forces a detour", () => {
    // A 3×3 room with a wall run along most of the middle row's S edges — the path must round
    // the gap; smoothing may not see THROUGH the wall.
    const ln = buildLevelNav(
      level("bend", 1, floorRect(0, 0, 3, 3), [
        { block: "wall", cell: [0, 1], edge: "S" },
        { block: "wall", cell: [1, 1], edge: "S" },
      ]),
    );
    const path = ln.nav.findPath(ln.nodeAt([0, 0])!, ln.nodeAt([0, 2])!);
    expect(path.length).toBeGreaterThan(2); // bent around the wall's free end
  });

  it("smooth: false returns the raw grid path", () => {
    const ln = buildLevelNav(level("raw", 1, floorRect(0, 0, 1, 5)), { smooth: false });
    expect(ln.nav.findPath(ln.nodeAt([0, 0])!, ln.nodeAt([0, 4])!)).toHaveLength(5);
  });
});

it("smoothing cannot see through carved furniture either", () => {
  // A 5×3 room with a table at its center: the carve removes the middle cell, so the
  // end-to-end path must detour — and the smoothed polyline must keep that bend.
  const ln = buildLevelNav(
    level("furn", 1, floorRect(0, 0, 5, 3), [{ block: "table", cell: [2, 1] }]),
  );
  const path = ln.nav.findPath(ln.nodeAt([0, 1])!, ln.nodeAt([4, 1])!);
  expect(path.length).toBeGreaterThan(2); // bent around the carved footprint
  expect(path[0].x).toBeCloseTo(0);
  expect(path[path.length - 1].x).toBeCloseTo(4);
});

describe("buildLevelNav · ramps", () => {
  // A lower floor (row 3, y=0), a 2-wide × 3-deep ramp climbing NORTH (toward -Z, row 0) from y=0
  // by rise 3.3, and an upper floor (row -1, y=3.3). The ramp should bridge the two storeys with a
  // floor-like grid whose cells carry an interpolated elevation.
  const rampLevel = () =>
    level("ramp", 1, [
      { block: "floor", cell: [0, 3], size: [2, 1] }, // lower landing, y=0
      { block: "ramp", cell: [0, 0], size: [2, 3], y: 0, params: { rise: 3.3, dir: "N" } },
      { block: "floor", cell: [0, -1], size: [2, 1], y: 3.3 }, // upper landing
    ]);

  it("paints a per-step elevation onto each ramp cell (foot low, head high)", () => {
    const ln = buildLevelNav(rampLevel());
    expect(ln.nodes).toHaveLength(2 + 6 + 2); // lower(2) + ramp(2×3) + upper(2)
    // run-index i = rowMax(2) − row; elevation = rise·(i+0.5)/steps with steps=3.
    expect(ln.nodeAt([0, 2], (3.3 * 0.5) / 3)).toBe(`0,2,${(3.3 * 0.5) / 3}`); // foot row (i=0)
    expect(ln.nodeAt([0, 1], (3.3 * 1.5) / 3)).toBe(`0,1,${(3.3 * 1.5) / 3}`); // middle (i=1)
    expect(ln.nodeAt([0, 0], (3.3 * 2.5) / 3)).toBe(`0,0,${(3.3 * 2.5) / 3}`); // head row (i=2)
  });

  it("connects the lower floor to the upper floor through the ramp (one component)", () => {
    const ln = buildLevelNav(rampLevel());
    expect(ln.components).toBe(1);
    const path = ln.nav.findPath(ln.nodeAt([0, 3])!, ln.nodeAt([0, -1], 3.3)!);
    expect(path.length).toBeGreaterThan(2); // descends through every ramp step
    expect(path[0].y).toBeCloseTo(0); // starts on the lower landing
    expect(path[path.length - 1].y).toBeCloseTo(3.3); // ends on the upper landing
  });

  it("lets an agent move sideways across the ramp at one elevation", () => {
    const ln = buildLevelNav(rampLevel());
    const y = (3.3 * 0.5) / 3; // the foot row's elevation
    const path = ln.nav.findPath(ln.nodeAt([0, 2], y)!, ln.nodeAt([1, 2], y)!);
    expect(path).toHaveLength(2); // direct width neighbours, same step
  });

  it("without the ramp the two storeys are separate islands", () => {
    const ln = buildLevelNav(
      level("gap", 1, [
        { block: "floor", cell: [0, 3], size: [2, 1] },
        { block: "floor", cell: [0, -1], size: [2, 1], y: 3.3 },
      ]),
    );
    expect(ln.components).toBe(2); // the ramp is what joins them
  });
});
