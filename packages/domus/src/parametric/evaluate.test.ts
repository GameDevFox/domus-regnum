import { afterEach, describe, expect, it, vi } from "vitest";

import { Scope } from "@kitsune/common-web/src/scope";
import { Value } from "@kitsune/common-web/src/value";

import { FreePlacement, GridPlacement, Level } from "../blocks/types";

import { cornerPostSize } from "../blocks/kinds/structural";
import { editorCottageDoc, editorManorDoc, fixtureManorDoc } from "../domus-app/level-editor";
import { buildLevelNav } from "../blocks/level-nav";
import { manorLevel } from "../blocks/sample-level";

import { deriveLevel } from "./derive-level";
import {
  addNode,
  deserializeDoc,
  serializeDoc,
  setPointAxis,
  setProp,
  unwireOne,
  wireAdd,
} from "./edit";
import { evaluateDoc } from "./evaluate";
import { defaultKinds } from "./kinds";
import { NodeKind, ParametricDoc, PropValue } from "./types";

// One rect driving a floor, a wall perimeter, and a centered table — the canonical example.
// Coordinates are world meters (doc v2, corner-anchored); at tile 1 the corner (2.5, 3.5)
// makes the NW cell (3, 4), so the cell-level expectations read like the old cell units.
const roomDoc = (): ParametricDoc => ({
  name: "room",
  tile: 1,
  nodes: [
    { id: "rect-1", kind: "rect", props: { position: { x: 2.5, y: 0, z: 3.5 }, size: { x: 10, y: 0, z: 12 } } },
    { id: "floor-1", kind: "floor", props: { rect: { bind: "rect-1" } } },
    { id: "walls-1", kind: "walls", props: { rect: { bind: "rect-1" } } },
    { id: "spawn-1", kind: "spawn", props: { rect: { bind: "rect-1" }, block: "table" } },
  ],
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("evaluateDoc — expansion", () => {
  it("expands a rect-driven room: one floor area, a wall perimeter, a centered table", () => {
    const scope = Scope();
    const { placements } = evaluateDoc(scope, roomDoc());
    const all = placements.peek();

    const floor = all.find((p) => p.block === "floor") as GridPlacement;
    expect(floor.cell).toEqual([3, 4]);
    expect(floor.size).toEqual([10, 12]);
    expect(floor.id).toBe("floor-1/area");

    const walls = all.filter((p) => p.block === "wall");
    expect(walls).toHaveLength(4); // one merged RUN per side (span = full side length)
    expect(walls.map((w) => w.id)).toEqual([
      "walls-1/N-0",
      "walls-1/S-0",
      "walls-1/W-0",
      "walls-1/E-0",
    ]);
    expect((walls[0] as GridPlacement).span).toBe(10); // N spans the rect's width
    // Runs are trimmed back to meet the corner posts: (thickness 0.2 + 0.02)/2 − 1 mm overlap.
    expect((walls[0] as GridPlacement).params?.trimStart).toBeCloseTo(0.109);
    expect((walls[0] as GridPlacement).params?.trimEnd).toBeCloseTo(0.109);

    // One corner post per rect vertex, at HALF-INTEGER cells (= exactly the vertex).
    const posts = all.filter((p) => p.block === "corner") as GridPlacement[];
    expect(posts.map((c) => c.id)).toEqual([
      "walls-1/NW",
      "walls-1/NE",
      "walls-1/SW",
      "walls-1/SE",
    ]);
    expect(posts[0].cell).toEqual([2.5, 3.5]); // NW vertex of a rect at (3,4)
    expect(posts[3].cell).toEqual([12.5, 15.5]); // SE vertex of 10×12

    const table = all.find((p) => p.block === "table") as GridPlacement;
    expect(table.cell).toEqual([3 + 4, 4 + 5]); // NW-biased center of 10×12
    expect(table.id).toBe("spawn-1/spawn");

    expect(all).toHaveLength(1 + 4 + 4 + 1);
  });

  it("resizing the rect regenerates everything downstream", () => {
    const scope = Scope();
    const docV = Value(roomDoc());
    const { placements } = evaluateDoc(scope, docV);

    docV.update((d) => setPointAxis(setPointAxis(d, "rect-1", "size", "x", 14), "rect-1", "size", "z", 20));

    const all = placements.peek();
    const floor = all.find((p) => p.block === "floor") as GridPlacement;
    expect(floor.size).toEqual([14, 20]);
    const walls = all.filter((p) => p.block === "wall") as GridPlacement[];
    expect(walls).toHaveLength(4);
    expect(walls.find((w) => w.id === "walls-1/N-0")?.span).toBe(14); // runs resized with the rect
    const table = all.find((p) => p.block === "table") as GridPlacement;
    expect(table.cell).toEqual([3 + 6, 4 + 9]); // re-centered
  });

  it("a multi-field literal edit notifies placements subscribers once (batched)", () => {
    const scope = Scope();
    const docV = Value(roomDoc());
    const { placements } = evaluateDoc(scope, docV);

    let fires = 0;
    placements._subscribe(() => fires++);
    docV.update((d) => setPointAxis(setPointAxis(d, "rect-1", "size", "x", 14), "rect-1", "size", "z", 20));
    expect(fires).toBe(1); // not once per touched prop
  });

  it("preserves derived item identity for untouched sources (keyed mounting stays cheap)", () => {
    const scope = Scope();
    const docV = Value(roomDoc());
    const { placements } = evaluateDoc(scope, docV);
    const before = placements.peek();
    const wallBefore = before.find((p) => p.id === "walls-1/N-0");

    // Touch a DIFFERENT node (the spawn's block) — the walls' output must keep identity, so
    // mountLevel's keyed each rebuilds only what changed instead of every mesh in the level.
    docV.update((d) => setProp(d, "spawn-1", "block", "chair"));

    const after = placements.peek();
    expect(after.find((p) => p.id === "walls-1/N-0")).toBe(wallBefore); // same object
    expect(after.find((p) => p.id === "spawn-1/spawn")?.block).toBe("chair");
  });

  it("walls runs + posts carry continuous texture-circuit starts (perimeter-uv)", () => {
    const scope = Scope();
    const { placements } = evaluateDoc(scope, roomDoc()); // 10×12 rect, tile 1
    const all = placements.peek();
    const part = (id: string) => all.find((p) => p.id === `walls-1/${id}`) as GridPlacement;
    const [w, h] = [10, 12];
    const ps = cornerPostSize(0.2); // posts consume arc length between sides
    const half = ps / 2;

    // Interior circuit (clockwise from NW): N front → E back → S back → W front.
    expect(part("N-0").params?.runStart).toBe(0);
    expect(part("E-0").params?.runStartBack).toBeCloseTo(w + ps);
    expect(part("S-0").params?.runStartBack).toBeCloseTo(w + h + 2 * ps);
    expect(part("W-0").params?.runStart).toBeCloseTo(2 * w + h + 3 * ps);
    // Exterior circuit (counterclockwise from NE): N back → W back → S front → E front.
    expect(part("N-0").params?.runStartBack).toBe(0);
    expect(part("W-0").params?.runStartBack).toBeCloseTo(w + ps);
    expect(part("S-0").params?.runStart).toBeCloseTo(w + h + 2 * ps);
    expect(part("E-0").params?.runStart).toBeCloseTo(2 * w + h + 3 * ps);
    // A post's faces show CONSECUTIVE windows: arrival continues the previous side, departure
    // leads into the next (never the same slice — that duplicated pattern borders).
    expect(part("NE").params?.uPosZ).toBeCloseTo(w - half); // interior arrival (N plane)
    expect(part("NE").params?.uNegX).toBeCloseTo(w + ps - half); // interior departure (E plane)
    expect(part("NE").params?.uNegZ).toBeCloseTo(-half); // exterior departure, anchor vertex
  });

  it("a hole splits a side's run; texture continues straight across the gap", () => {
    const scope = Scope();
    const docV = Value(roomDoc()); // N side = 10 m at tile 1
    const { placements } = evaluateDoc(scope, docV);
    // A 2 m door centered on the N side: {side, pos: Measure, size: Measure} — pos is the hole CENTER.
    docV.update((d) =>
      setProp(d, "walls-1", "holes", [
        { side: "N", pos: { scale: 0.5, offset: 0 }, size: { scale: 0, offset: 2 } },
      ]),
    );
    const walls = placements.peek().filter((p) => p.block === "wall") as GridPlacement[];
    expect(walls).toHaveLength(5); // N split in two; the other three sides stay whole
    const nSegs = walls.filter((w) => String(w.id).startsWith("walls-1/N-"));
    expect(nSegs.map((s) => s.id)).toEqual(["walls-1/N-0", "walls-1/N-6"]);
    expect(nSegs.map((s) => s.span)).toEqual([4, 4]); // hole covers relative cells 4–5
    // Interior circuit: the right segment picks the pattern up exactly where the gap ends.
    expect(nSegs[1].params?.runStart).toBeCloseTo(6);
    // Exterior circuit mirrors: left segment's back face anchors at L − its right edge.
    expect(nSegs[0].params?.runStartBack).toBeCloseTo(10 - 4);
  });

  it("nav passes through a wall hole but stays blocked along the remaining segments", () => {
    const scope = Scope();
    const docV = Value(roomDoc());
    docV.update((d) =>
      setProp(d, "walls-1", "holes", [
        { side: "N", pos: { scale: 0.5, offset: 0 }, size: { scale: 0, offset: 2 } },
      ]),
    );
    const { placements } = evaluateDoc(scope, docV);
    // Add a floor apron on the row just OUTSIDE the N wall so there's somewhere to route from.
    const lvl: Level = {
      name: "t",
      tile: 1,
      placements: [...placements.peek(), { block: "floor", cell: [3, 3], size: [10, 1] }],
    };
    const ln = buildLevelNav(lvl, { furniture: false });
    // The hole frees relative cells 4–5 → world columns 7–8 (rect.x = 3): direct crossing.
    expect(ln.nav.findPath(ln.nodeAt([7, 3])!, ln.nodeAt([7, 4])!)).toHaveLength(2);
    // Away from the hole the wall still blocks — the only way in is the detour via the hole.
    const detour = ln.nav.findPath(ln.nodeAt([3, 3])!, ln.nodeAt([3, 4])!);
    expect(detour.length).toBeGreaterThan(2);
  });

  it("a door node fills its own hole: opening output → walls.holes binding", () => {
    const scope = Scope();
    const base = roomDoc();
    const docV = Value({
      ...base,
      nodes: [
        ...base.nodes,
        {
          id: "door-1",
          kind: "door",
          props: { rect: { bind: "rect-1" }, size: { scale: 0, offset: 2 } },
        },
      ],
    });
    const { placements } = evaluateDoc(scope, docV);
    // Wire the door's opening into the walls (single binding; multi-binding lands separately).
    docV.update((d) => setProp(d, "walls-1", "holes", { bind: "door-1", output: "opening" }));

    const all = placements.peek();
    const fill = all.find((p) => p.id === "door-1/fill") as FreePlacement;
    // 10 m N side, centered 2 m door → hole [4,6]; wall line z = 3.5; center x = 2.5 + 5.
    expect(fill.pos).toEqual([7.5, 0, 3.5]);
    expect(fill.params?.span).toBe(2);
    expect(fill.params?.runStart).toBeCloseTo(4); // the pattern continues into the frame
    const nSegs = all.filter((p) => String(p.id).startsWith("walls-1/N-"));
    expect(nSegs.map((s) => s.id)).toEqual(["walls-1/N-0", "walls-1/N-6"]);

    // Slide the door: ONE edit moves the hole and the fill together.
    docV.update((d) => setProp(d, "door-1", "pos", { scale: 0.5, offset: 2 }));
    const after = placements.peek();
    expect((after.find((p) => p.id === "door-1/fill") as FreePlacement).pos[0]).toBeCloseTo(9.5);
    expect(after.filter((p) => String(p.id).startsWith("walls-1/N-")).map((s) => s.id)).toEqual([
      "walls-1/N-0",
      "walls-1/N-8",
    ]);
  });

  it("MULTI-BINDING: several doors wire into one holes input via wireAdd", () => {
    const scope = Scope();
    const base = roomDoc();
    const door = (id: string, posScale: number) => ({
      id,
      kind: "door",
      props: {
        rect: { bind: "rect-1" },
        pos: { scale: posScale, offset: 0 },
        size: { scale: 0, offset: 2 },
      },
    });
    const docV = Value({
      ...base,
      nodes: [...base.nodes, door("door-1", 0.25), door("door-2", 0.75)],
    });
    const { placements } = evaluateDoc(scope, docV);

    docV.update((d) => wireAdd(d, "walls-1", "holes", { bind: "door-1", output: "opening" }));
    docV.update((d) => wireAdd(d, "walls-1", "holes", { bind: "door-2", output: "opening" }));

    // 10 m N side, 2 m doors at 25%/75% → holes [1.5,3.5] and [6.5,8.5] → three segments.
    const segs = placements
      .peek()
      .filter((p) => String(p.id).startsWith("walls-1/N-"))
      .map((p) => p.id);
    expect(segs).toEqual(["walls-1/N-0", "walls-1/N-3", "walls-1/N-8"]);

    // Unwiring ONE door heals only its hole.
    docV.update((d) => unwireOne(d, "walls-1", "holes", { bind: "door-1", output: "opening" }));
    expect(
      placements
        .peek()
        .filter((p) => String(p.id).startsWith("walls-1/N-"))
        .map((p) => p.id),
    ).toEqual(["walls-1/N-0", "walls-1/N-8"]);
  });

  it("a window fills like a door but carves a nav footprint", () => {
    const scope = Scope();
    const base = roomDoc();
    const docV = Value({
      ...base,
      nodes: [
        ...base.nodes,
        {
          id: "window-1",
          kind: "window",
          props: { rect: { bind: "rect-1" }, side: "W", size: { scale: 0, offset: 2 } },
        },
      ],
    });
    const { placements } = evaluateDoc(scope, docV);
    const fill = placements.peek().find((p) => p.id === "window-1/fill") as FreePlacement;
    // W side is 12 m; centered → [5,7]; west wall line x = 2.5; center z = 3.5 + 6.
    expect(fill.block).toBe("window");
    expect(fill.pos).toEqual([2.5, 0, 9.5]);
    expect(fill.rotY).toBeCloseTo(Math.PI / 2);
    expect(fill.params?.footprintW).toBe(2); // agents can't walk through glazing
  });

  it("the `fill` selector switches an opening between none / door / window", () => {
    const scope = Scope();
    const base = roomDoc();
    // A `hole` preset (fill defaults to "none") with a region wired so it CAN render a frame.
    const docV = Value({
      ...base,
      nodes: [...base.nodes, { id: "op-1", kind: "hole", props: { rect: { bind: "rect-1" }, side: "W" } }],
    });
    const { placements } = evaluateDoc(scope, docV);
    const fill = () => placements.peek().find((p) => p.id === "op-1/fill") as FreePlacement | undefined;

    expect(fill()).toBeUndefined(); // "none" → a bare gap, no frame

    docV.update((d) => setProp(d, "op-1", "fill", "door")); // sockets a door…
    expect(fill()?.block).toBe("doorway");

    docV.update((d) => setProp(d, "op-1", "fill", "window")); // …or a window…
    expect(fill()?.block).toBe("window");

    docV.update((d) => setProp(d, "op-1", "fill", "none")); // …or back to bare.
    expect(fill()).toBeUndefined();
  });

  it("walls thickness drives the runs, the posts, and the corner trim", () => {
    const scope = Scope();
    const docV = Value(roomDoc());
    const { placements } = evaluateDoc(scope, docV);

    docV.update((d) => setProp(d, "walls-1", "thickness", 0.3));
    const all = placements.peek();
    const north = all.find((p) => p.id === "walls-1/N-0") as GridPlacement;
    expect(north.params?.thickness).toBe(0.3);
    expect(north.params?.trimStart).toBeCloseTo(cornerPostSize(0.3) / 2 - 0.001);
    const post = all.find((p) => p.id === "walls-1/NW") as GridPlacement;
    expect(post.params?.thickness).toBe(0.3); // posts size from it too
  });

  it("literal edits update instances in place; structural edits rebuild them", () => {
    const scope = Scope();
    const docV = Value(roomDoc());
    const evaluated = evaluateDoc(scope, docV);
    const before = evaluated.outputs("rect-1");

    docV.update((d) => setPointAxis(d, "rect-1", "size", "x", 14)); // literal — same instance
    expect(evaluated.outputs("rect-1")).toBe(before);

    docV.update((d) => addNode(d, { id: "rect-2", kind: "rect", props: { size: { x: 2, y: 0, z: 2 } } })); // structural — instance graph rebuilt
    expect(evaluated.outputs("rect-1")).not.toBe(before);
    expect(evaluated.outputs("rect-2")).toBeDefined();
  });
});

describe("evaluateDoc — ramp (rect + rise)", () => {
  const rampDoc = (): ParametricDoc => ({
    name: "ramp-room",
    tile: 1,
    nodes: [
      { id: "rect-1", kind: "rect", props: { position: { x: 2.5, y: 1.1, z: 3.5 }, size: { x: 2, y: 0, z: 4 } } },
      { id: "ramp-1", kind: "ramp", props: { rect: { bind: "rect-1" }, rise: 3.3, dir: "S" } },
    ],
  });

  it("emits one grid placement carrying rise/dir params, sized + elevated from the rect", () => {
    const scope = Scope();
    const { placements } = evaluateDoc(scope, rampDoc());
    const all = placements.peek();

    expect(all).toHaveLength(1);
    const ramp = all[0] as GridPlacement;
    expect(ramp.id).toBe("ramp-1/area");
    expect(ramp.block).toBe("ramp");
    expect(ramp.cell).toEqual([3, 4]); // corner (2.5, 3.5) at tile 1 → NW cell (3, 4)
    expect(ramp.size).toEqual([2, 4]);
    expect(ramp.y).toBe(1.1); // rect elevation carries through
    expect(ramp.params?.rise).toBe(3.3);
    expect(ramp.params?.dir).toBe("S");
  });

  it("emits nothing for a sub-tile rect", () => {
    const scope = Scope();
    const doc = rampDoc();
    const { placements } = evaluateDoc(
      scope,
      setPointAxis(setPointAxis(doc, "rect-1", "size", "x", 0.5), "rect-1", "size", "z", 0.5),
    );
    expect(placements.peek()).toEqual([]);
  });
});

describe("evaluateDoc — point + wall (individual walls)", () => {
  const segDoc = (bx: number, by: number): ParametricDoc => ({
    name: "seg",
    tile: 1,
    nodes: [
      { id: "point-1", kind: "point", props: { x: 2, z: 3 } },
      { id: "point-2", kind: "point", props: { x: bx, z: by } },
      { id: "wall-1", kind: "wall", props: { a: { bind: "point-1" }, b: { bind: "point-2" } } },
    ],
  });

  it("two points expand to ONE point-to-point run — no corner posts on a single wall", () => {
    const scope = Scope();
    const { placements } = evaluateDoc(scope, segDoc(7, 3));
    const all = placements.peek();

    const run = all.find((p) => p.block === "wall") as FreePlacement;
    expect(run.pos).toEqual([4.5, 0, 3]); // midpoint of (2,3)→(7,3)
    expect(run.rotY).toBeCloseTo(0); // along +X
    expect(run.params?.span).toBeCloseTo(5); // exact world length (span × tile=1)
    expect(run.params?.footprintW).toBeCloseTo(5); // navmesh carves it like furniture

    expect(all).toEqual([run]); // the run is ALL it emits (posts are the `walls` kind's job)
    expect(run.id).toBe("wall-1/run");
  });

  it("vertical and DIAGONAL pairs render point-to-point at the exact angle", () => {
    const vert = evaluateDoc(Scope(), segDoc(2, 9)).placements.peek();
    const vRun = vert.find((p) => p.block === "wall") as FreePlacement;
    expect(vRun.pos).toEqual([2, 0, 6]);
    expect(vRun.rotY).toBeCloseTo(-Math.PI / 2); // local +X aimed at world +Z
    expect(vRun.params?.span).toBeCloseTo(6);

    const diag = evaluateDoc(Scope(), segDoc(8, 5)).placements.peek(); // (2,3)→(8,5)
    const dRun = diag.find((p) => p.block === "wall") as FreePlacement;
    expect(dRun.pos).toEqual([5, 0, 4]); // midpoint
    expect(dRun.params?.span).toBeCloseTo(Math.hypot(6, 2)); // true diagonal length
    expect(dRun.rotY).toBeCloseTo(Math.atan2(-2, 6)); // aimed a → b
  });

  it("thickness defaults, edits live, and supersedes the params blob", () => {
    const scope = Scope();
    const docV = Value(segDoc(7, 3));
    const { placements } = evaluateDoc(scope, docV);
    const run = () => placements.peek().find((p) => p.block === "wall") as FreePlacement;

    expect(run().params?.thickness).toBe(0.2); // the default, present without any edit

    docV.update((d) => setProp(d, "wall-1", "thickness", 0.5)); // literal edit — live
    expect(run().params?.thickness).toBe(0.5);

    // The first-class input wins over a thickness smuggled into the params blob; the blob's
    // other keys still flow.
    docV.update((d) => setProp(d, "wall-1", "params", { thickness: 0.9, color: 1 }));
    expect(run().params?.thickness).toBe(0.5);
    expect(run().params?.color).toBe(1);

    // The other finish inputs flow the same way: style → wallStyle, texOffset verbatim.
    expect(run().params?.wallStyle).toBe("wallpaper"); // default
    docV.update((d) => setProp(setProp(d, "wall-1", "style", "wood"), "wall-1", "texOffset", 1.25));
    expect(run().params?.wallStyle).toBe("wood");
    expect(run().params?.texOffset).toBe(1.25);
  });

  it("a value node feeds thickness through a binding; editing the constant re-flows", () => {
    const scope = Scope();
    const base = segDoc(7, 3);
    const docV = Value({
      ...base,
      nodes: [...base.nodes, { id: "value-1", kind: "value", props: { value: 0.35 } }],
    });
    const { placements } = evaluateDoc(scope, docV);
    const run = () => placements.peek().find((p) => p.block === "wall") as FreePlacement;

    docV.update((d) => setProp(d, "wall-1", "thickness", { bind: "value-1" }));
    expect(run().params?.thickness).toBe(0.35);

    docV.update((d) => setProp(d, "value-1", "value", 0.6)); // edit the constant — wall follows
    expect(run().params?.thickness).toBe(0.6);
  });

  it("a text node feeds the wall style through a binding", () => {
    const scope = Scope();
    const base = segDoc(7, 3);
    const docV = Value({
      ...base,
      nodes: [...base.nodes, { id: "text-1", kind: "text", props: { value: "wood" } }],
    });
    const { placements } = evaluateDoc(scope, docV);
    const run = () => placements.peek().find((p) => p.block === "wall") as FreePlacement;

    docV.update((d) => setProp(d, "wall-1", "style", { bind: "text-1" }));
    expect(run().params?.wallStyle).toBe("wood");

    docV.update((d) => setProp(d, "text-1", "value", "wallpaper")); // edit the constant — re-flows
    expect(run().params?.wallStyle).toBe("wallpaper");
  });

  it("moving one point regenerates the wall; coincident points collapse to nothing", () => {
    const scope = Scope();
    const docV = Value(segDoc(7, 3));
    const { placements } = evaluateDoc(scope, docV);

    docV.update((d) => setProp(d, "point-2", "x", 12));
    const run = placements.peek().find((p) => p.block === "wall") as FreePlacement;
    expect(run.params?.span).toBeCloseTo(10);

    docV.update((d) => setProp(setProp(d, "point-2", "x", 2), "point-2", "z", 3)); // onto a
    expect(placements.peek()).toEqual([]);
  });
});

describe("evaluateDoc — point + railing (two-point guard)", () => {
  const railDoc = (bx: number, by: number): ParametricDoc => ({
    name: "rail",
    tile: 1,
    nodes: [
      { id: "point-1", kind: "point", props: { x: 2, z: 3 } },
      { id: "point-2", kind: "point", props: { x: bx, z: by } },
      { id: "rail-1", kind: "railing", props: { a: { bind: "point-1" }, b: { bind: "point-2" } } },
    ],
  });

  it("two points expand to ONE point-to-point railing run with nav carve + guard defaults", () => {
    const all = evaluateDoc(Scope(), railDoc(7, 3)).placements.peek();
    const run = all.find((p) => p.block === "railing") as FreePlacement;
    expect(run.pos).toEqual([4.5, 0, 3]); // midpoint of (2,3)→(7,3)
    expect(run.rotY).toBeCloseTo(0); // along +X
    expect(run.params?.span).toBeCloseTo(5); // exact world length (span × tile=1)
    expect(run.params?.footprintW).toBeCloseTo(5); // navmesh carves it like a free wall
    expect(run.params?.height).toBe(1); // height default
    expect(run.params?.thickness).toBe(0.1); // footprint depth default
    expect(run.id).toBe("rail-1/run");
    expect(all).toEqual([run]); // a single run, nothing else
  });

  it("renders at the exact diagonal angle; height/thickness edit live and reflow on move", () => {
    const docV = Value(railDoc(8, 5)); // (2,3)→(8,5)
    const { placements } = evaluateDoc(Scope(), docV);
    const run = () => placements.peek().find((p) => p.block === "railing") as FreePlacement;
    expect(run().rotY).toBeCloseTo(Math.atan2(-2, 6));
    expect(run().params?.span).toBeCloseTo(Math.hypot(6, 2));

    docV.update((d) => setProp(setProp(d, "rail-1", "height", 0.95), "rail-1", "thickness", 0.14));
    expect(run().params?.height).toBe(0.95);
    expect(run().params?.thickness).toBe(0.14);

    docV.update((d) => setProp(setProp(d, "point-2", "x", 2), "point-2", "z", 3)); // onto a
    expect(placements.peek()).toEqual([]); // coincident → nothing
  });
});

describe("evaluateDoc — candelabra (wall-mounted at a point + height)", () => {
  const candDoc = (): ParametricDoc => ({
    name: "cand",
    tile: 1,
    nodes: [
      { id: "point-1", kind: "point", props: { x: 2, z: -3 } }, // a spot on a wall line
      { id: "cand-1", kind: "candelabra", props: { at: { bind: "point-1" } } },
    ],
  });

  it("places the candelabra at the point's XZ with height as the Y (default = lower sconce 2.3)", () => {
    const all = evaluateDoc(Scope(), candDoc()).placements.peek();
    const item = all.find((p) => p.block === "candelabra") as FreePlacement;
    expect(item.pos).toEqual([2, 2.3, -3]); // x,z from the point; y from the height default
    expect(item.rotY).toBe(0); // face "" → no rotation
    expect(item.params?.on).toBe(true); // candle lit by default
    expect(item.id).toBe("cand-1/item");
    expect(all).toEqual([item]);
  });

  it("the `on` toggle flows to the placement params (the block reads it to add/skip the light)", () => {
    const docV = Value(candDoc());
    const { placements } = evaluateDoc(Scope(), docV);
    const item = () => placements.peek().find((p) => p.block === "candelabra") as FreePlacement;
    docV.update((d) => setProp(d, "cand-1", "on", false));
    expect(item().params?.on).toBe(false); // candle off — model still placed
  });

  it("height edits live (0 → centered on the vertical origin) and face turns it to the wall", () => {
    const docV = Value(candDoc());
    const { placements } = evaluateDoc(Scope(), docV);
    const item = () => placements.peek().find((p) => p.block === "candelabra") as FreePlacement;

    docV.update((d) => setProp(d, "cand-1", "height", 0));
    expect(item().pos[1]).toBe(0); // y=0 → the block (bbox-centered) sits on the vertical origin

    docV.update((d) => setProp(d, "cand-1", "face", "N"));
    expect(item().rotY).toBeCloseTo(Math.PI); // N

    docV.update((d) => setProp(d, "cand-1", "at", null as unknown as PropValue));
    expect(placements.peek()).toEqual([]); // no point → nothing
  });
});

describe("evaluateDoc — bindings", () => {
  // A tiny test kind: doubles a number input. Used to exercise binding `path`.
  const double: NodeKind = {
    inputs: { n: { type: "number", default: 0 } },
    outputs: { out: { type: "number" } },
    build: (scope, { n }) => ({ out: scope.computed((use) => (use(n) as number) * 2) }),
  };
  const registry = { ...defaultKinds, double };

  it("a binding path picks one field of the source output", () => {
    const scope = Scope();
    const docV = Value<ParametricDoc>({
      name: "t",
      tile: 1,
      nodes: [
        { id: "rect-1", kind: "rect", props: { size: { x: 10, y: 0, z: 12 } } },
        { id: "double-1", kind: "double", props: { n: { bind: "rect-1", path: "w" } } },
      ],
    });
    const evaluated = evaluateDoc(scope, docV, registry);
    expect(evaluated.outputs("double-1")!.out.peek()).toBe(20);

    docV.update((d) => setPointAxis(d, "rect-1", "size", "x", 7)); // flows through the path
    expect(evaluated.outputs("double-1")!.out.peek()).toBe(14);
  });

  it("skips cyclic nodes with a warning, keeps evaluating the rest", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const scope = Scope();
    const doc: ParametricDoc = {
      name: "t",
      tile: 1,
      nodes: [
        { id: "a", kind: "double", props: { n: { bind: "b" } } },
        { id: "b", kind: "double", props: { n: { bind: "a" } } },
        { id: "rect-1", kind: "rect", props: { size: { x: 2, y: 0, z: 2 } } },
        { id: "floor-1", kind: "floor", props: { rect: { bind: "rect-1" } } },
      ],
    };
    const evaluated = evaluateDoc(scope, doc, registry);
    expect(evaluated.outputs("a")).toBeUndefined();
    expect(evaluated.outputs("b")).toBeUndefined();
    expect(evaluated.placements.peek()).toHaveLength(1); // floor still derived
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("cycle"));
  });

  it("skips unknown kinds and defaults dangling bindings, both with warnings", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const scope = Scope();
    const doc: ParametricDoc = {
      name: "t",
      tile: 1,
      nodes: [
        { id: "x", kind: "nope", props: {} },
        { id: "floor-1", kind: "floor", props: { rect: { bind: "ghost" } } },
      ],
    };
    const evaluated = evaluateDoc(scope, doc);
    expect(evaluated.outputs("x")).toBeUndefined();
    expect(evaluated.placements.peek()).toEqual([]); // region defaulted to null → no floor
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("unknown node kind"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("missing"));
  });
});

describe("deriveLevel", () => {
  it("mirrors name/tile and stays live through edits", () => {
    const scope = Scope();
    const docV = Value(roomDoc());
    const level = deriveLevel(scope, docV, evaluateDoc(scope, docV));

    expect(level.peek().name).toBe("room");
    expect(level.peek().tile).toBe(1);
    expect(level.peek().placements).toHaveLength(10); // floor + 4 runs + 4 posts + table

    docV.update((d) => setPointAxis(d, "rect-1", "size", "x", 14));
    expect(level.peek().placements).toHaveLength(10); // merged runs: the COUNT is size-stable
  });
});

describe("anchor kind (frames, slice 1 of doc 14)", () => {
  it("outputs a world-space frame, yaw in degrees CCW from +X", () => {
    const scope = Scope();
    const doc: ParametricDoc = {
      name: "a",
      tile: 0.5,
      nodes: [{ id: "anchor-1", kind: "anchor", props: { position: { x: 2, y: 1, z: 1 }, yaw: 90 } }],
    };
    const evaluated = evaluateDoc(scope, doc);
    const frame = evaluated.outputs("anchor-1")!.out.peek() as {
      pos: number[];
      facing: number[];
      key: string;
    };
    expect(frame.pos).toEqual([2, 1, 1]); // world meters as-is (doc v2), elevation 1
    expect(frame.facing[0]).toBeCloseTo(0); // yaw 90° CCW: +X turns to −Z (north)
    expect(frame.facing[2]).toBeCloseTo(-1);
    expect(frame.key).toBe("anchor");
  });
});

describe("instance kind (frames → placements, slice 2 of doc 14)", () => {
  it("stamps a block at each bound frame, oriented to the frame's facing", () => {
    const docV = Value<ParametricDoc>({
      name: "i",
      tile: 0.5,
      nodes: [
        { id: "anchor-1", kind: "anchor", props: { position: { x: 2, y: 1, z: 1 }, yaw: 90 } },
        { id: "anchor-2", kind: "anchor", props: { position: { x: 4, y: 0, z: 0 }, yaw: 0 } },
        {
          id: "inst-1",
          kind: "instance",
          props: { block: "lamp", frames: [{ bind: "anchor-1" }, { bind: "anchor-2" }] },
        },
      ],
    });
    const { placements } = evaluateDoc(Scope(), docV);
    const lamps = () => placements.peek().filter((p) => p.block === "lamp") as FreePlacement[];
    expect(lamps()).toHaveLength(2); // one per frame
    const a = lamps().find((p) => p.pos[0] === 2)!;
    expect(a.pos).toEqual([2, 1, 1]); // anchor-1's frame pos (world meters, elevation 1)
    expect(a.rotY).toBeCloseTo(Math.PI / 2); // yaw 90 → facing −Z → rotY π/2
    const b = lamps().find((p) => p.pos[0] === 4)!;
    expect(b.rotY).toBeCloseTo(0); // yaw 0 → facing +X → rotY 0

    // Moving the anchor moves its instanced block (frames are live).
    docV.update((d) => setPointAxis(d, "anchor-1", "position", "x", 5));
    expect(lamps().find((p) => p.pos[0] === 5)).toBeTruthy();
  });

  it("emits nothing when frames is unbound", () => {
    const doc: ParametricDoc = {
      name: "i",
      tile: 0.5,
      nodes: [{ id: "inst-1", kind: "instance", props: { block: "lamp" } }],
    };
    expect(evaluateDoc(Scope(), doc).placements.peek()).toEqual([]);
  });
});

describe("multi-binding round-trips and door sides", () => {
  it("a doc with Binding[] props survives serialize → deserialize → evaluate", () => {
    const base = roomDoc();
    const doc: ParametricDoc = {
      ...base,
      nodes: [
        ...base.nodes.map((n) =>
          n.id === "walls-1"
            ? {
                ...n,
                props: {
                  ...n.props,
                  holes: [
                    { bind: "door-1", output: "opening" },
                    { bind: "door-2", output: "opening" },
                  ],
                },
              }
            : n,
        ),
        {
          id: "door-1",
          kind: "door",
          props: { rect: { bind: "rect-1" }, pos: { scale: 0.25, offset: 0 } },
        },
        {
          id: "door-2",
          kind: "door",
          props: { rect: { bind: "rect-1" }, pos: { scale: 0.75, offset: 0 } },
        },
      ],
    };
    const revived = deserializeDoc(serializeDoc(doc));
    const { placements } = evaluateDoc(Scope(), revived);
    const nSegs = placements.peek().filter((p) => String(p.id).startsWith("walls-1/N-"));
    expect(nSegs.length).toBe(3); // both doors still punch after the round-trip
  });

  it("an E-side door lands on the east wall line, rotated with the side", () => {
    const base = roomDoc(); // rect x3 y4 w10 h12, tile 1
    const doc: ParametricDoc = {
      ...base,
      nodes: [
        ...base.nodes,
        { id: "door-1", kind: "door", props: { rect: { bind: "rect-1" }, side: "E" } },
      ],
    };
    const { placements } = evaluateDoc(Scope(), doc);
    const fill = placements.peek().find((p) => p.id === "door-1/fill") as FreePlacement;
    // East wall line x = 2.5 + 10 = 12.5; E side is 12 m, centered → z = 3.5 + 6.
    expect(fill.pos).toEqual([12.5, 0, 9.5]);
    expect(fill.rotY).toBeCloseTo(Math.PI / 2);
  });
});

describe("hole kind + the corner rule", () => {
  it("a bare hole punches without fill; touching the vertex removes the post and extends the neighbour", () => {
    const scope = Scope();
    const base = roomDoc(); // 10×12 rect at (3,4), tile 1
    const docV = Value({
      ...base,
      nodes: [
        ...base.nodes,
        // Centered at the N side's END (posScale 1), 4 m wide → unclamped [8,12]: touches NE.
        {
          id: "hole-1",
          kind: "hole",
          props: { side: "N", pos: { scale: 1, offset: 0 }, size: { scale: 0, offset: 4 } },
        },
      ],
    });
    const { placements } = evaluateDoc(scope, docV);
    docV.update((d) => wireAdd(d, "walls-1", "holes", { bind: "hole-1", output: "opening" }));

    const all = placements.peek();
    expect(all.some((p) => String(p.id).startsWith("hole-1/"))).toBe(false); // no fill, ever
    expect(all.find((p) => p.id === "walls-1/NE")).toBeUndefined(); // the touched corner is gone
    expect(all.find((p) => p.id === "walls-1/NW")).toBeDefined(); // the others survive
    // The E side still walls into that vertex — and now EXTENDS to it. MIRROR NOTE: W/E runs
    // rotate 90°, so the factory's trimEnd is the side's NORTH end (the open one here).
    const e0 = all.find((p) => p.id === "walls-1/E-0") as GridPlacement;
    expect(e0.params?.trimEnd).toBe(0); // north end: extends to the open NE vertex
    expect(e0.params?.trimStart).toBeCloseTo(0.109); // south end still meets the SE post
    // The N side keeps its solid stretch [trim, 8].
    const n0 = all.find((p) => p.id === "walls-1/N-0") as GridPlacement;
    expect(n0.span).toBe(8);
  });

  it("a door shoved into a corner opens it too (one rule for all openings)", () => {
    const scope = Scope();
    const base = roomDoc();
    const docV = Value({
      ...base,
      nodes: [
        ...base.nodes,
        {
          id: "door-1",
          kind: "door",
          props: {
            rect: { bind: "rect-1" },
            pos: { scale: 0, offset: 0 },
            size: { scale: 0, offset: 2 },
          },
        },
      ],
    });
    const { placements } = evaluateDoc(scope, docV);
    docV.update((d) => wireAdd(d, "walls-1", "holes", { bind: "door-1", output: "opening" }));
    expect(placements.peek().find((p) => p.id === "walls-1/NW")).toBeUndefined();
  });

  it("the two-point wall splits around holes (side ignored), texture continuous", () => {
    const scope = Scope();
    const docV = Value<ParametricDoc>({
      name: "seg",
      tile: 1,
      nodes: [
        { id: "point-1", kind: "point", props: { x: 2, z: 3 } },
        { id: "point-2", kind: "point", props: { x: 7, z: 3 } },
        { id: "wall-1", kind: "wall", props: { a: { bind: "point-1" }, b: { bind: "point-2" } } },
        {
          id: "hole-1",
          kind: "hole",
          props: { side: "E", pos: { scale: 0.5, offset: 0 }, size: { scale: 0, offset: 1 } },
        },
      ],
    });
    const { placements } = evaluateDoc(scope, docV);
    docV.update((d) => wireAdd(d, "wall-1", "holes", { bind: "hole-1", output: "opening" }));

    const segs = placements.peek().filter((p) => p.block === "wall") as FreePlacement[];
    // 5 m run, 1 m hole centered → segments [0,2] and [3,5] (the hole's side "E" is ignored).
    expect(segs.map((s) => s.id)).toEqual(["wall-1/run-0", "wall-1/run-3000"]);
    expect(segs[0].pos).toEqual([3, 0, 3]); // midpoint of world [2,4]
    expect(segs[1].pos).toEqual([6, 0, 3]); // midpoint of world [5,7]
    expect(segs[1].params?.runStart).toBeCloseTo(3); // pattern picks up across the gap
    expect(segs[0].params?.footprintW).toBeCloseTo(2); // nav carve per segment
  });
});

describe("W/E mirror (factory local −X = the side's south end)", () => {
  it("segments on a W-side hole anchor textures from the correct vertices", () => {
    const scope = Scope();
    const base = roomDoc(); // 10×12 at (3,4), tile 1; W side L = 12
    const docV = Value({
      ...base,
      nodes: [
        ...base.nodes,
        // 2 m hole centered on the W side → cell-order [5,7] (north-measured).
        { id: "hole-1", kind: "hole", props: { side: "W", size: { scale: 0, offset: 2 } } },
      ],
    });
    const { placements } = evaluateDoc(scope, docV);
    docV.update((d) => wireAdd(d, "walls-1", "holes", { bind: "hole-1", output: "opening" }));
    const ps = cornerPostSize(0.2);
    const segs = placements
      .peek()
      .filter((p) => String(p.id).startsWith("walls-1/W-")) as GridPlacement[];
    expect(segs.map((s) => s.id)).toEqual(["walls-1/W-0", "walls-1/W-7"]);
    // W front face = interior circuit, which starts at the SOUTH vertex (SW). The NORTH
    // segment (W-0, cells 0–4) is the FAR one on that circuit: anchored at L − 5 = 7 from SW.
    const intStart = 2 * 10 + 12 + 3 * ps; // sides.W.front for this room (see perimeter-uv)
    expect(segs[0].params?.runStart).toBeCloseTo(intStart + 7);
    // The SOUTH segment (W-7, cells 7–11) starts AT the SW vertex on that circuit.
    expect(segs[1].params?.runStart).toBeCloseTo(intStart + 0);
    // Trims: both posts survive (no corner touch) — outermost physical ends carry the trim.
    expect(segs[0].params?.trimEnd).toBeCloseTo(0.109); // W-0's north end meets the NW post
    expect(segs[0].params?.trimStart).toBeCloseTo(0); // its south end is the hole edge
  });
});

describe("seg-basis door + cull", () => {
  it("a door bound to the wall's two points fills along the run", () => {
    const scope = Scope();
    const docV = Value<ParametricDoc>({
      name: "seg",
      tile: 1,
      nodes: [
        { id: "point-1", kind: "point", props: { x: 2, z: 3 } },
        { id: "point-2", kind: "point", props: { x: 7, z: 3 } },
        { id: "wall-1", kind: "wall", props: { a: { bind: "point-1" }, b: { bind: "point-2" } } },
        {
          id: "door-1",
          kind: "door",
          props: { a: { bind: "point-1" }, b: { bind: "point-2" }, size: { scale: 0, offset: 1 } },
        },
      ],
    });
    const { placements } = evaluateDoc(scope, docV);
    docV.update((d) => wireAdd(d, "wall-1", "holes", { bind: "door-1", output: "opening" }));

    const fill = placements.peek().find((p) => p.id === "door-1/fill") as FreePlacement;
    expect(fill.pos).toEqual([4.5, 0, 3]); // centered on the 5 m run
    expect(fill.rotY).toBeCloseTo(0);
    expect(fill.params?.span).toBe(1);
    expect(fill.params?.runStart).toBeCloseTo(2); // pattern continues from the left segment
    const segs = placements.peek().filter((p) => p.block === "wall");
    expect(segs.map((s) => s.id)).toEqual(["wall-1/run-0", "wall-1/run-3000"]);
  });

  it("cull stamps outward viewSides on runs, posts, and region fills", () => {
    const scope = Scope();
    const base = roomDoc();
    const docV = Value({
      ...base,
      nodes: [
        ...base.nodes.map((n) =>
          n.id === "walls-1" ? { ...n, props: { ...n.props, cull: true } } : n,
        ),
        {
          id: "door-1",
          kind: "door",
          props: { rect: { bind: "rect-1" }, side: "S", cull: true },
        },
      ],
    });
    const { placements } = evaluateDoc(scope, docV);
    const all = placements.peek();
    const get = (id: string) => all.find((p) => p.id === `walls-1/${id}`) as GridPlacement;
    expect(get("N-0").params?.viewSide).toBe("front"); // interior is south of the N wall
    expect(get("S-0").params?.viewSide).toBe("back");
    expect(get("E-0").params?.viewSide).toBe("back");
    expect(get("NW").params?.cullH).toBe("front"); // N wall's side
    expect(get("NW").params?.cullV).toBe("front"); // W wall's side
    expect(get("SE").params?.cullH).toBe("back");
    const fill = all.find((p) => p.id === "door-1/fill") as FreePlacement;
    expect(fill.params?.viewSide).toBe("back"); // culls with its S wall
  });
});

describe("deriveRect — a rect from a rect (per-field measures)", () => {
  const src = { id: "rect-1", kind: "rect", props: { position: { x: 2, y: 0, z: 3 }, size: { x: 12, y: 0, z: 8 } } };
  const derived = (
    props: Record<string, unknown>,
  ): { x: number; y: number; z: number; w: number; d: number } =>
    evaluateDoc(Scope(), {
      name: "d",
      tile: 1,
      nodes: [
        src as never,
        {
          id: "dr-1",
          kind: "deriveRect",
          props: { rect: { bind: "rect-1" }, ...props },
        } as never,
      ],
    })
      .outputs("dr-1")!
      .out.peek() as never;

  it("defaults to an exact copy of the source", () => {
    expect(derived({})).toEqual({ x: 2, y: 0, z: 3, w: 12, d: 8 });
  });

  it("carves the left third (inset): x{0} width{1/3}", () => {
    expect(derived({ width: { scale: 1 / 3, offset: 0 } })).toMatchObject({ x: 2, w: 4 });
    expect(
      derived({ x: { scale: 1 / 3, offset: 0 }, width: { scale: 1 / 3, offset: 0 } }),
    ).toMatchObject({
      x: 2 + 4, // a third across
      w: 4,
    });
  });

  it("adjoins to the right with the same width: x{1} width{1}", () => {
    expect(derived({ x: { scale: 1, offset: 0 } })).toMatchObject({ x: 2 + 12, w: 12 });
  });

  it("stacks a floor above: y offset adds to height, footprint unchanged", () => {
    expect(derived({ y: { scale: 0, offset: 3.3 } })).toEqual({
      x: 2,
      y: 3.3,
      z: 3,
      w: 12,
      d: 8,
    });
  });

  it("offsets compose with scale (width − 1 m inset both sides)", () => {
    // shrink width by 2 m and nudge x in 1 m → a 1 m margin on the left/right.
    expect(derived({ x: { scale: 0, offset: 1 }, width: { scale: 1, offset: -2 } })).toMatchObject({
      x: 3,
      w: 10,
    });
  });
});

describe("rectPoint — dynamic points pinned to a rect", () => {
  it("resolves x against width and z against depth from the NW corner; height rides", () => {
    const doc: ParametricDoc = {
      name: "rp",
      tile: 0.5,
      nodes: [
        { id: "rect-1", kind: "rect", props: { position: { x: 2, y: 3.3, z: 3 }, size: { x: 6, y: 0, z: 4 } } },
        {
          id: "rectPoint-1",
          kind: "rectPoint",
          props: {
            rect: { bind: "rect-1" },
            x: { scale: 0.5, offset: 1 }, // half the width + 1 m
            z: { scale: 0, offset: 3 }, // a fixed 3 m below the north edge
          },
        },
        { id: "rectPoint-2", kind: "rectPoint", props: {} }, // unwired → null
      ],
    };
    const evaluated = evaluateDoc(Scope(), doc);
    expect(evaluated.outputs("rectPoint-1")!.out.peek()).toEqual({ x: 6, y: 3.3, z: 6 });
    expect(evaluated.outputs("rectPoint-2")!.out.peek()).toBeNull();
  });

  it("a wall on rectPoints RIDES the rect: scaling the rect reflows the wall", () => {
    const docV = Value<ParametricDoc>({
      name: "ride",
      tile: 0.5,
      nodes: [
        { id: "rect-1", kind: "rect", props: { position: { x: 0, y: 0, z: 0 }, size: { x: 6, y: 0, z: 4 } } },
        {
          id: "rectPoint-1",
          kind: "rectPoint",
          props: {
            rect: { bind: "rect-1" },
            x: { scale: 0, offset: 0 },
            z: { scale: 0.5, offset: 0 },
          },
        },
        {
          id: "rectPoint-2",
          kind: "rectPoint",
          props: {
            rect: { bind: "rect-1" },
            x: { scale: 1, offset: 0 },
            z: { scale: 0.5, offset: 0 },
          },
        },
        {
          id: "wall-1",
          kind: "wall",
          props: { a: { bind: "rectPoint-1" }, b: { bind: "rectPoint-2" } },
        },
      ],
    });
    const { placements } = evaluateDoc(Scope(), docV);
    const run = () => placements.peek().find((p) => p.block === "wall") as FreePlacement;
    expect(run().params?.span).toBeCloseTo(6); // spans the rect's full width
    expect(run().pos).toEqual([3, 0, 2]); // centered on the mid-height line

    docV.update((d) => setPointAxis(d, "rect-1", "size", "x", 10)); // scale the rect — the wall follows
    expect(run().params?.span).toBeCloseTo(10);
    expect(run().pos).toEqual([5, 0, 2]);
  });
});

describe("finish node", () => {
  it("one finish node drives a wall + its door; supersedes their own knobs; edits re-flow", () => {
    const base = roomDoc();
    const docV = Value<ParametricDoc>({
      ...base,
      nodes: [
        // walls-1 / door-1 carry their OWN thickness 0.2 / wallpaper; the finish must override.
        ...base.nodes.map((n) =>
          n.id === "walls-1"
            ? { ...n, props: { ...n.props, thickness: 0.2, finish: { bind: "finish-1" } } }
            : n,
        ),
        {
          id: "finish-1",
          kind: "finish",
          props: { thickness: 0.4, texOffset: 1.5, style: "wood" },
        },
        {
          id: "door-1",
          kind: "door",
          props: { rect: { bind: "rect-1" }, finish: { bind: "finish-1" } },
        },
      ],
    });
    const { placements } = evaluateDoc(Scope(), docV);
    const wallParams = () =>
      (placements.peek().find((p) => p.id === "walls-1/N-0") as GridPlacement).params!;
    const doorParams = () =>
      (placements.peek().find((p) => p.id === "door-1/fill") as FreePlacement).params!;

    // The bound finish wins over walls-1's own thickness 0.2 and the kinds' wallpaper default.
    expect(wallParams().thickness).toBe(0.4);
    expect(wallParams().wallStyle).toBe("wood");
    expect(doorParams().thickness).toBe(0.4);
    expect(doorParams().wallStyle).toBe("wood");
    expect(doorParams().texOffset).toBe(1.5);

    // One edit to the finish node re-flows BOTH the wall and the door.
    docV.update((d) => setProp(d, "finish-1", "style", "wallpaper"));
    expect(wallParams().wallStyle).toBe("wallpaper");
    expect(doorParams().wallStyle).toBe("wallpaper");
  });

  it("an unbound finish leaves the kind's own thickness/style in force", () => {
    const base = roomDoc();
    const docV = Value<ParametricDoc>({
      ...base,
      nodes: base.nodes.map((n) =>
        n.id === "walls-1" ? { ...n, props: { ...n.props, thickness: 0.33, style: "wood" } } : n,
      ),
    });
    const { placements } = evaluateDoc(Scope(), docV);
    const wp = (placements.peek().find((p) => p.id === "walls-1/N-0") as GridPlacement).params!;
    expect(wp.thickness).toBe(0.33); // own knob, since finish is unbound
    expect(wp.wallStyle).toBe("wood");
  });
});

describe("measure constant node", () => {
  it("one measure node drives several openings' size; editing the constant re-flows", () => {
    const base = roomDoc();
    const docV = Value<ParametricDoc>({
      ...base,
      nodes: [
        ...base.nodes,
        { id: "measure-1", kind: "measure", props: { scale: 0, offset: 2 } },
        {
          id: "door-1",
          kind: "door",
          props: {
            rect: { bind: "rect-1" },
            pos: { scale: 0.25, offset: 0 },
            size: { bind: "measure-1" },
          },
        },
        {
          id: "door-2",
          kind: "door",
          props: {
            rect: { bind: "rect-1" },
            pos: { scale: 0.75, offset: 0 },
            size: { bind: "measure-1" },
          },
        },
      ],
    });
    const { placements } = evaluateDoc(Scope(), docV);
    const span = (id: string) =>
      (placements.peek().find((p) => p.id === `${id}/fill`) as FreePlacement).params?.span;
    expect(span("door-1")).toBe(2);
    expect(span("door-2")).toBe(2);

    docV.update((d) => setProp(d, "measure-1", "offset", 3)); // one edit, both doors widen
    expect(span("door-1")).toBe(3);
    expect(span("door-2")).toBe(3);
  });
});

describe("point coordinates bind dynamically", () => {
  it("a point node drives rect.size; a value feeding the point's x re-flows the room", () => {
    const base = roomDoc();
    const docV = Value<ParametricDoc>({
      ...base,
      nodes: [
        ...base.nodes,
        { id: "value-1", kind: "value", props: { value: 6 } },
        // size as a point whose width (x) is driven by the value node, depth (z) fixed.
        { id: "size-1", kind: "point", props: { x: { bind: "value-1" }, y: 0, z: 12 } },
      ],
    });
    const { placements } = evaluateDoc(Scope(), docV);
    const floor = () => placements.peek().find((p) => p.block === "floor") as GridPlacement;

    docV.update((d) => setProp(d, "rect-1", "size", { bind: "size-1" }));
    expect(floor().size).toEqual([6, 12]);

    docV.update((d) => setProp(d, "value-1", "value", 9)); // edit the constant — the room follows
    expect(floor().size).toEqual([9, 12]);
  });
});

describe("smooth (non-cell-aligned) geometry", () => {
  it("a fractional-meters room still derives floor nodes and a connected navmesh", () => {
    // The magnet off: a room dragged to arbitrary meters. Floor cells = centers covered;
    // perimeter runs block via their footprintW carve (fractional edge keys can't match).
    const doc: ParametricDoc = {
      name: "frac",
      tile: 0.5,
      nodes: [
        { id: "rect-1", kind: "rect", props: { position: { x: -3.2, y: 0, z: -2.1 }, size: { x: 6.3, y: 0, z: 4.7 } } },
        { id: "floor-1", kind: "floor", props: { rect: { bind: "rect-1" } } },
        { id: "walls-1", kind: "walls", props: { rect: { bind: "rect-1" } } },
      ],
    };
    const { placements } = evaluateDoc(Scope(), doc);
    const lvl: Level = { name: "f", tile: 0.5, placements: placements.peek() };
    const ln = buildLevelNav(lvl);
    // ~12×9 cell interior (minus any centers under the wall slabs) — present and ONE region.
    expect(ln.nodes.length).toBeGreaterThan(80);
    expect(ln.components).toBe(1);
  });
});

describe("Graph Manor (fixtureManorDoc — frozen flat fixture)", () => {
  it("derives a fully connected level — agents can walk every room through the doorways", () => {
    const { placements } = evaluateDoc(Scope(), fixtureManorDoc());
    const lvl: Level = { name: "pm", tile: 0.5, placements: placements.peek() };
    const ln = buildLevelNav(lvl);
    expect(ln.components).toBe(1); // one region: front door + three partition doorways connect all
    // Full nav parity with the hand-placed manor: the walkable cell SETS are identical, so the
    // parametric shell (edge-blocking runs + zero-buffer partition/window carves) reproduces the
    // original's circulation exactly.
    const key = ([c, r]: [number, number]) => `${c},${r}`;
    const hand = buildLevelNav(manorLevel);
    expect(new Set(ln.cells.map(key))).toEqual(new Set(hand.cells.map(key)));
  });

  it("matches the flat Manor's structure: culled shell, 6 openings, 3 partition walls", () => {
    const { placements } = evaluateDoc(Scope(), fixtureManorDoc());
    const all = placements.peek();
    expect(all.filter((p) => p.block === "doorway")).toHaveLength(4); // front + 3 partition doors
    expect(all.filter((p) => p.block === "window")).toHaveLength(5);
    expect(all.filter((p) => p.block === "corner")).toHaveLength(4); // no opening touches a vertex
    const north = all.find((p) => p.id === "walls-1/N-0") as GridPlacement;
    expect(north.params?.viewSide).toBe("front"); // cull stamped
    expect(north.params?.thickness).toBe(0.3);
  });

  it("the whole north wing RIDES the shell when it scales (rectPoints + proportional measures)", () => {
    const docV = Value(fixtureManorDoc());
    const { placements } = evaluateDoc(Scope(), docV);
    docV.update((d) => setPointAxis(d, "rect-1", "size", "x", 20)); // widen the manor 13.5 → 20 m
    const all = placements.peek();
    const at = (id: string) => (all.find((p) => p.id === id) as FreePlacement).pos;

    // North windows stay centered in their rooms: x = corner + 20·(1/6 | 1/2 | 5/6).
    expect(at("win-study/fill")[0]).toBeCloseTo(-6.75 + 20 / 6);
    expect(at("win-gallery/fill")[0]).toBeCloseTo(-6.75 + 10);
    expect(at("win-bed/fill")[0]).toBeCloseTo(-6.75 + (20 * 5) / 6);
    // W/E windows center on the hall stretch below the partition: y = 3 + (8.5 − 3)/2 = 5.75.
    expect(at("win-w/fill")[2]).toBeCloseTo(-4.25 + 5.75);
    // Partition doors re-center in their rooms along the (now 20 m) run.
    expect(at("door-study/fill")[0]).toBeCloseTo(-6.75 + 20 / 6);
    expect(at("door-bed/fill")[0]).toBeCloseTo(-6.75 + (20 * 5) / 6);
    // Dividers hold their thirds: wall-v1 stands at x = corner + 20/3.
    expect(at("wall-v1/run")[0]).toBeCloseTo(-6.75 + 20 / 3);
  });

  it("great-hall furniture is identical at the default size and reflows when the room scales", () => {
    const docV = Value(fixtureManorDoc());
    const { placements } = evaluateDoc(Scope(), docV);
    const at = (id: string) => (placements.peek().find((p) => p.id === id) as FreePlacement).pos;

    // DEFAULT: the parametric hall group lands on the hand-placed coords (so nav parity holds).
    expect(at("hall-table/item")).toEqual([0, 0, 1.5]); // table at hall center
    expect(at("hall-rug/item")).toEqual([0, 0, 1.5]); // rug under the table
    expect(at("hall-chair-0/item")).toEqual([0, 0, 1.0]); // N chair, 0.5 m above the table
    expect(at("hall-chair-2/item")).toEqual([-1.0, 0, 1.5]); // W chair, 1 m left

    // SCALE: table tracks the hall center (x:0.5 → stays centered; y:{0.5,1.5}); chairs keep
    // their FIXED 0.5/1.0 m offsets (they move WITH the table, don't spread apart).
    docV.update((d) => setPointAxis(setPointAxis(d, "rect-1", "size", "x", 20), "rect-1", "size", "z", 12));
    const tableX = -6.75 + 0.5 * 20; // horizontal center of the widened room = 3.25
    const tableZ = -4.25 + 0.5 * 12 + 1.5; // hall center of the deepened room = 3.25
    expect(at("hall-table/item")).toEqual([tableX, 0, tableZ]);
    expect(at("hall-chair-0/item")).toEqual([tableX, 0, tableZ - 0.5]); // still 0.5 m away
    expect(at("hall-chair-2/item")).toEqual([tableX - 1.0, 0, tableZ]); // still 1 m away
  });

  it("ALL furniture lands on its hand-placed coords by default (nav parity across the wing)", () => {
    const { placements } = evaluateDoc(Scope(), fixtureManorDoc());
    const at = (id: string) => (placements.peek().find((p) => p.id === id) as FreePlacement).pos;
    // Spot-check one piece per room/kind against its centered world position (sample-level.ts).
    expect(at("study-table/item")).toEqual([-5.5, 0, -3.5]);
    expect(at("study-chair/item")).toEqual([-5.5, 0, -3.0]); // table + 0.5 m
    expect(at("study-cab/item")).toEqual([-3.5, 0, -4.0]); // against the north wall
    expect(at("study-plant/item")).toEqual([-6.0, 0, -2.0]); // SW corner
    expect(at("gal-plantW/item")).toEqual([-1.5, 0, -3.5]);
    expect(at("gal-plantE/item")).toEqual([1.5, 0, -3.5]);
    expect(at("bed/item")).toEqual([4.5, 0, -3.0]);
    expect(at("bed-cab/item")).toEqual([3.0, 0, -4.0]);
    expect(at("bed-plant/item")).toEqual([6.0, 0, -2.0]);
    expect(at("hall-fireplace/item")).toEqual([-2.25, 0, -1.0]); // centered between the W & center doors
    expect(at("hall-colW/item")).toEqual([-6.0, 0, 3.5]);
    expect(at("hall-barrel/item")).toEqual([5.0, 0, 2.5]);
  });

  it("corner-pinned pieces hold a FIXED inset from their room's corner when it scales", () => {
    const docV = Value(fixtureManorDoc());
    const { placements } = evaluateDoc(Scope(), docV);
    const at = (id: string) => (placements.peek().find((p) => p.id === id) as FreePlacement).pos;
    docV.update((d) => setPointAxis(d, "rect-1", "size", "x", 20)); // widen 13.5 → 20 m (NW corner fixed)
    // Bedchamber is the right third → its sub-rect's left edge moves to corner + 2·(20/3).
    const bedLeft = -6.75 + (2 / 3) * 20;
    expect(at("bed-cab/item")[0]).toBeCloseTo(bedLeft + 0.75); // wardrobe stays 0.75 m from its W wall
    expect(at("bed/item")[0]).toBeCloseTo(bedLeft + 20 / 3 / 2); // bed stays centered in its room
  });

  it("the hall-split knob resizes the hall and north rooms together; both bands reflow", () => {
    const docV = Value(fixtureManorDoc());
    const { placements } = evaluateDoc(Scope(), docV);
    const at = (id: string) => (placements.peek().find((p) => p.id === id) as FreePlacement).pos;
    const setSplit = (patch: Record<string, number>) =>
      docV.update((d) => ({
        ...d,
        nodes: d.nodes.map((n) =>
          n.id === "hall-split" ? { ...n, props: { ...n.props, ...patch } } : n,
        ),
      }));

    // Push the split to 4 m below the north wall: the partition wall slides down and BOTH bands
    // resize — the hall is now 8.5 − 4 = 4.5 m deep (its furniture recentres) and the north rooms
    // become 4 m deep. One knob drives both, via the shared measure + its complement.
    setSplit({ offset: 4 });
    expect(at("door-study/fill")[2]).toBeCloseTo(-4.25 + 4); // a partition door (on wall-h) at z = top + 4
    expect(at("hall-table/item")[2]).toBeCloseTo(-0.25 + 0.5 * 4.5); // hall recentred in its band

    // Percentage split: 50 % of the 8.5 m depth, no offset → the partition lands at the middle.
    setSplit({ scale: 0.5, offset: 0 });
    expect(at("door-study/fill")[2]).toBeCloseTo(-4.25 + 0.5 * 8.5);
  });
});

describe("Graph Manor — grouped showcase (editorManorDoc)", () => {
  it("folds each room into a furniture-only component, preserving the flat fixture's geometry", () => {
    const grouped = editorManorDoc();
    // Four room components, instanced once each; the shell + partitions stay top-level.
    expect((grouped.components ?? []).map((c) => c.name).sort()).toEqual([
      "BedChamber",
      "GalleryRoom",
      "GreatHall",
      "StudyRoom",
    ]);
    // Output-preserving: grouping changes only the graph's shape, not the derived geometry — so the
    // showcase yields the same placement count and the same single connected nav region as the
    // frozen flat fixture (every room still reachable through the doorways).
    const gp = evaluateDoc(Scope(), grouped).placements.peek();
    const fp = evaluateDoc(Scope(), fixtureManorDoc()).placements.peek();
    expect(gp.length).toBe(fp.length);
    const lvl: Level = { name: "pm", tile: 0.5, placements: gp };
    expect(buildLevelNav(lvl).components).toBe(1);
  });
});

describe("Graph Cottage (editorCottageDoc)", () => {
  it("derives one connected room with a culled shell, 1 door + 2 windows", () => {
    const { placements } = evaluateDoc(Scope(), editorCottageDoc());
    const all = placements.peek();
    expect(all.filter((p) => p.block === "doorway")).toHaveLength(1); // front door
    expect(all.filter((p) => p.block === "window")).toHaveLength(2); // N + W
    expect(all.filter((p) => p.block === "corner")).toHaveLength(4); // four shell corners
    const lvl: Level = { name: "pc", tile: 0.5, placements: all };
    expect(buildLevelNav(lvl).components).toBe(1); // one open room, reachable through the door
    const north = all.find((p) => p.id === "walls-1/N-0") as GridPlacement;
    expect(north.params?.viewSide).toBe("front"); // cull stamped, like the flat cottage
  });

  it("all furniture lands on its hand-placed cottage coords by default", () => {
    const { placements } = evaluateDoc(Scope(), editorCottageDoc());
    const at = (id: string) => (placements.peek().find((p) => p.id === id) as FreePlacement).pos;
    // Each piece mirrors cottageLevel after centerLevel (dc=-5, dr=-4, tile 0.5).
    expect(at("table/item")).toEqual([0, 0, 0.5]);
    expect(at("rug/item")).toEqual([0, 0, 0.5]); // under the table
    expect(at("chair/item")).toEqual([0, 0, -0.5]); // 1 m north of the table
    expect(at("fireplace/item")).toEqual([-2.5, 0, -1.0]); // W wall
    expect(at("bed/item")).toEqual([2.0, 0, -1.5]); // NE
    expect(at("cabinet/item")).toEqual([-1.25, 0, -2.0]); // N wall, ~25% from the west corner
    expect(at("barrel/item")).toEqual([2.0, 0, 1.5]); // SE corner
    expect(at("plant/item")).toEqual([-2.5, 0, 1.5]); // SW corner
    expect(at("lamp/item")).toEqual([-1.5, 0, 1.5]);
  });

  it("furniture reflows when the room scales — wall pieces hold their inset, the chair its offset", () => {
    const docV = Value(editorCottageDoc());
    const { placements } = evaluateDoc(Scope(), docV);
    const at = (id: string) => (placements.peek().find((p) => p.id === id) as FreePlacement).pos;
    docV.update((d) => setPointAxis(setPointAxis(d, "rect-1", "size", "x", 9), "rect-1", "size", "z", 7)); // 5.5×4.5 → 9×7 m
    // Table stays at center-X (0.5) just south of middle; chair keeps its fixed 1 m offset north.
    const tableX = -2.75 + 0.5 * 9; // 1.75
    const tableZ = -2.25 + 0.5 * 7 + 0.5; // 1.75
    expect(at("table/item")).toEqual([tableX, 0, tableZ]);
    expect(at("chair/item")).toEqual([tableX, 0, tableZ - 1.0]);
    // Bed pins to the east wall (scale 1) with a fixed −0.75 m inset → it rides the widening.
    expect(at("bed/item")[0]).toBeCloseTo(-2.75 + 9 - 0.75);
    // Barrel holds the SE corner (both scale 1) with fixed insets.
    expect(at("barrel/item")[0]).toBeCloseTo(-2.75 + 9 - 0.75);
    expect(at("barrel/item")[2]).toBeCloseTo(-2.25 + 7 - 0.75);
  });
});
