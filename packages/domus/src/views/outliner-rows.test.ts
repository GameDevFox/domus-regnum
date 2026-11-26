import { describe, expect, it } from "vitest";

import { DocNode, ParametricDoc } from "../parametric/types";

import { dependencyPrimitives, nodeFocusCenter } from "../parametric/node-focus";

import { buildOutlinerRows, OutlinerRow } from "./outliner-rows";

const doc = (nodes: DocNode[]): ParametricDoc => ({ name: "t", tile: 1, nodes });

// rect-1 drives floor-1 + walls-1; point-1/point-2 define wall-1; spawn-1 is unbound.
const sample = (): ParametricDoc =>
  doc([
    { id: "rect-1", kind: "rect", props: { w: 4, d: 4 } },
    { id: "floor-1", kind: "floor", props: { rect: { bind: "rect-1" } } },
    { id: "walls-1", kind: "walls", props: { rect: { bind: "rect-1" } } },
    { id: "point-1", kind: "point", props: { x: 0, z: 0 } },
    { id: "point-2", kind: "point", props: { x: 4, z: 0 } },
    { id: "wall-1", kind: "wall", props: { a: { bind: "point-1" }, b: { bind: "point-2" } } },
    { id: "spawn-1", kind: "spawn", props: { block: "table" } },
    { id: "manual-1", kind: "placements", props: { placements: [] } },
  ]);

const ids = (rows: OutlinerRow[]) => rows.map((r) => r.node.id);
const byId = (rows: OutlinerRow[], id: string) => rows.find((r) => r.node.id === id)!;

describe("buildOutlinerRows", () => {
  it("products: unconsumed nodes are roots, dependencies nest under them", () => {
    const rows = buildOutlinerRows(sample(), "products");
    expect(ids(rows)).toEqual(["floor-1", "walls-1", "wall-1", "spawn-1"]);
    expect(ids(byId(rows, "floor-1").children)).toEqual(["rect-1"]);
    expect(ids(byId(rows, "wall-1").children)).toEqual(["point-1", "point-2"]);
    expect(byId(rows, "spawn-1").children).toEqual([]);
  });

  it("sources: dependency-less nodes are roots, consumers nest under them", () => {
    const rows = buildOutlinerRows(sample(), "sources");
    expect(ids(rows)).toEqual(["rect-1", "point-1", "point-2", "spawn-1"]);
    expect(ids(byId(rows, "rect-1").children)).toEqual(["floor-1", "walls-1"]);
    // The DAG bit: wall-1 appears under BOTH of its points, with distinct paths.
    expect(ids(byId(rows, "point-1").children)).toEqual(["wall-1"]);
    expect(ids(byId(rows, "point-2").children)).toEqual(["wall-1"]);
    expect(byId(rows, "point-1").children[0].path).toBe("point-1/wall-1");
    expect(byId(rows, "point-2").children[0].path).toBe("point-2/wall-1");
  });

  it("chains nest recursively (point → wall → consumer)", () => {
    const d = doc([
      { id: "point-1", kind: "point", props: {} },
      { id: "point-2", kind: "point", props: {} },
      { id: "wall-1", kind: "wall", props: { a: { bind: "point-1" }, b: { bind: "point-2" } } },
      { id: "instance-1", kind: "instance", props: { frames: { bind: "wall-1" } } },
    ]);
    const products = buildOutlinerRows(d, "products");
    expect(ids(products)).toEqual(["instance-1"]);
    expect(ids(products[0].children)).toEqual(["wall-1"]);
    expect(ids(products[0].children[0].children)).toEqual(["point-1", "point-2"]);

    const sources = buildOutlinerRows(d, "sources");
    expect(byId(sources, "point-1").children[0].children[0].path).toBe("point-1/wall-1/instance-1");
  });

  it("dedupes a node bound twice by the same parent", () => {
    const d = doc([
      { id: "point-1", kind: "point", props: {} },
      { id: "wall-1", kind: "wall", props: { a: { bind: "point-1" }, b: { bind: "point-1" } } },
    ]);
    expect(ids(byId(buildOutlinerRows(d, "products"), "wall-1").children)).toEqual(["point-1"]);
    expect(ids(byId(buildOutlinerRows(d, "sources"), "point-1").children)).toEqual(["wall-1"]);
  });

  it("excludes the manual node and ignores dangling bindings", () => {
    const d = doc([
      { id: "manual-1", kind: "placements", props: { placements: [] } },
      { id: "floor-1", kind: "floor", props: { rect: { bind: "gone-1" } } },
    ]);
    const rows = buildOutlinerRows(d, "products");
    expect(ids(rows)).toEqual(["floor-1"]);
    expect(rows[0].children).toEqual([]);
  });

  it("surfaces malformed cycles as roots without hanging", () => {
    const d = doc([
      { id: "a", kind: "floor", props: { rect: { bind: "b" } } },
      { id: "b", kind: "floor", props: { rect: { bind: "a" } } },
    ]);
    ["products", "sources"].forEach((dir) => {
      const rows = buildOutlinerRows(d, dir as "products" | "sources");
      expect(ids(rows)).toEqual(["a", "b"]);
      // Each descends through the other once, then the path guard cuts the loop.
      expect(ids(rows[0].children)).toEqual(["b"]);
      expect(rows[0].children[0].children).toEqual([]);
    });
  });
});

describe("dependencyPrimitives", () => {
  it("is the node itself for a primitive", () => {
    const d = sample();
    expect(dependencyPrimitives(d, d.nodes[0]).map((n) => n.id)).toEqual(["rect-1"]);
  });

  it("collects all primitives a generator derives from, through chains", () => {
    const d = doc([
      { id: "point-1", kind: "point", props: {} },
      { id: "point-2", kind: "point", props: {} },
      { id: "wall-1", kind: "wall", props: { a: { bind: "point-1" }, b: { bind: "point-2" } } },
      { id: "instance-1", kind: "instance", props: { frames: { bind: "wall-1" } } },
    ]);
    const inst = d.nodes.find((n) => n.id === "instance-1")!;
    expect(
      dependencyPrimitives(d, inst)
        .map((n) => n.id)
        .sort(),
    ).toEqual(["point-1", "point-2"]);
  });

  it("returns no primitives for an unbound generator", () => {
    const d = sample();
    const spawn = d.nodes.find((n) => n.id === "spawn-1")!;
    expect(dependencyPrimitives(d, spawn)).toEqual([]);
  });
});

describe("nodeFocusCenter", () => {
  it("frames a wall at the midpoint of its two points (world meters)", () => {
    const d = doc([
      { id: "point-1", kind: "point", props: { x: 0, z: 0 } },
      { id: "point-2", kind: "point", props: { x: 4, z: 2 } },
      { id: "wall-1", kind: "wall", props: { a: { bind: "point-1" }, b: { bind: "point-2" } } },
    ]);
    expect(nodeFocusCenter(d, "wall-1")).toEqual({ x: 2, y: 0, z: 1 });
  });

  it("frames a rect-driven generator at the rect's center; unanchored nodes give null", () => {
    // Corner-anchored meters (doc v5: position/size points): a 5×3 rect at (2, 2) centers at (4.5, 3.5).
    const d = doc([
      { id: "rect-1", kind: "rect", props: { position: { x: 2, y: 0, z: 2 }, size: { x: 5, y: 0, z: 3 } } },
      { id: "door-1", kind: "door", props: { rect: { bind: "rect-1" } } },
      { id: "spawn-9", kind: "spawn", props: {} },
    ]);
    expect(nodeFocusCenter(d, "door-1")).toEqual({ x: 4.5, y: 0, z: 3.5 });
    expect(nodeFocusCenter(d, "spawn-9")).toBeNull();
  });
});
