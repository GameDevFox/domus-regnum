import { describe, expect, it } from "vitest";

import { fixtureManorDoc } from "../domus-app/level-editor";
import { DocNode, ParametricDoc } from "../parametric/types";

import {
  estimateHeight,
  organizedCrossings,
  organizedDoc,
  organizePositions,
} from "./graph-layout";

const doc = (nodes: DocNode[]): ParametricDoc => ({ name: "t", tile: 0.5, nodes });

// point/point → wall, rect → floor + door, door → walls (multi-binding) — a doc exercising
// chains of depth 0, 1, and 2 plus the manual node.
const sample = (): ParametricDoc =>
  doc([
    { id: "manual-1", kind: "placements", props: { list: [] } },
    { id: "rect-1", kind: "rect", props: { x: 0, y: 0, w: 4, h: 3 } },
    { id: "door-1", kind: "door", props: { rect: { bind: "rect-1" } } },
    {
      id: "walls-1",
      kind: "walls",
      props: { rect: { bind: "rect-1" }, holes: [{ bind: "door-1", output: "opening" }] },
    },
    { id: "floor-1", kind: "floor", props: { rect: { bind: "rect-1" } } },
    { id: "point-1", kind: "point", props: { x: 0, y: 0 } },
    { id: "point-2", kind: "point", props: { x: 4, y: 0 } },
    { id: "wall-1", kind: "wall", props: { a: { bind: "point-1" }, b: { bind: "point-2" } } },
  ]);

describe("organizePositions", () => {
  it("layers by longest dependency chain: sources left, every consumer right of ALL its deps", () => {
    const pos = organizePositions(sample());
    // Column x positions are a fixed stride — compare relative order.
    expect(pos["rect-1"].x).toBe(pos["point-1"].x); // both sources, column 0
    expect(pos["door-1"].x).toBeGreaterThan(pos["rect-1"].x); // consumer of rect
    expect(pos["floor-1"].x).toBe(pos["door-1"].x); // same depth as door
    expect(pos["wall-1"].x).toBe(pos["door-1"].x);
    // walls binds door.opening → it must sit RIGHT of door, not beside it.
    expect(pos["walls-1"].x).toBeGreaterThan(pos["door-1"].x);
  });

  it("parks the manual placements node in the rightmost column", () => {
    const pos = organizePositions(sample());
    const maxX = Math.max(...Object.values(pos).map((p) => p.x));
    expect(pos["manual-1"].x).toBe(maxX);
  });

  it("never overlaps nodes within a column (stacked by estimated height + gap)", () => {
    const d = sample();
    const pos = organizePositions(d);
    const byId = new Map(d.nodes.map((n) => [n.id, n]));
    const cols = new Map<number, { y: number; h: number }[]>();
    Object.entries(pos).forEach(([id, p]) => {
      const list = cols.get(p.x) ?? [];
      list.push({ y: p.y, h: estimateHeight(byId.get(id)!) });
      cols.set(p.x, list);
    });
    cols.forEach((list) => {
      list.sort((a, b) => a.y - b.y);
      for (let i = 1; i < list.length; i++)
        expect(list[i].y).toBeGreaterThanOrEqual(list[i - 1].y + list[i - 1].h);
    });
  });

  it("orders a column by its dependencies' positions (barycenter keeps noodles short)", () => {
    // Two independent chains: rect-a → floor-a and rect-b → floor-b. Whatever order the
    // sources land in, each floor sits on the same side as its own rect.
    const pos = organizePositions(
      doc([
        { id: "rect-a", kind: "rect", props: {} },
        { id: "rect-b", kind: "rect", props: {} },
        { id: "floor-b", kind: "floor", props: { rect: { bind: "rect-b" } } },
        { id: "floor-a", kind: "floor", props: { rect: { bind: "rect-a" } } },
      ]),
    );
    expect(pos["rect-a"].y).toBeLessThan(pos["rect-b"].y); // doc order for sources
    expect(pos["floor-a"].y).toBeLessThan(pos["floor-b"].y); // followers match their deps
  });

  it("survives malformed cycles without hanging", () => {
    const pos = organizePositions(
      doc([
        { id: "a", kind: "floor", props: { rect: { bind: "b" } } },
        { id: "b", kind: "floor", props: { rect: { bind: "a" } } },
      ]),
    );
    expect(pos["a"]).toBeDefined();
    expect(pos["b"]).toBeDefined();
  });

  it("is deterministic — the same doc lays out identically every call", () => {
    const d = sample();
    expect(organizePositions(d)).toEqual(organizePositions(d));
  });
});

describe("crossing minimization", () => {
  it("removes the crossing from two reversed-order parallel chains", () => {
    // col0 order [rect-a, rect-b], col1 doc order [floor-b, floor-a] → the noodles cross once;
    // the ordering pass flips col1 to uncross them.
    const d = doc([
      { id: "rect-a", kind: "rect", props: {} },
      { id: "rect-b", kind: "rect", props: {} },
      { id: "floor-b", kind: "floor", props: { rect: { bind: "rect-b" } } },
      { id: "floor-a", kind: "floor", props: { rect: { bind: "rect-a" } } },
    ]);
    expect(organizedCrossings(d, false)).toBe(1); // doc-order baseline crosses
    expect(organizedCrossings(d, true)).toBe(0); // optimizer uncrosses
  });

  it("slashes crossings on the Graph Manor graph and stays well below baseline", () => {
    const manor = fixtureManorDoc();
    const baseline = organizedCrossings(manor, false);
    const optimized = organizedCrossings(manor, true);
    expect(optimized).toBeLessThan(baseline); // the ordering pass earns its keep
    expect(optimized).toBeLessThanOrEqual(baseline / 3); // and substantially (≈155 → 40 at writing)
    // NOTE: the old absolute "≤ 4" target was for the pre-split manor; the hall-split fan-out (one
    // measure into 8 consumers) raises the crossing floor, and the layout-algorithm rework (TODO.md)
    // will revisit crossing/height targets anyway. The ratio above still asserts a strong reduction.
  });
});

describe("compact layout — no node flung far from the rest", () => {
  // Regression for the diverging relaxation: the old one-directional overlap push drifted the
  // whole graph downward each pass and flung island/edge nodes (manual-1, wall-h) to y≈28k.
  // The Graph Manor layout must stay within a bounded box — every node packed with the rest,
  // none stranded thousands of px away.
  it("keeps the Graph Manor layout inside a bounded bounding box", () => {
    const doc = fixtureManorDoc();
    const byId = new Map(doc.nodes.map((n) => [n.id, n]));
    const pos = organizePositions(doc);
    const entries = Object.values(pos);
    const ids = Object.keys(pos);

    const tops = entries.map((p) => p.y);
    const bottoms = ids.map((id, i) => entries[i].y + estimateHeight(byId.get(id)!));
    const xs = entries.map((p) => p.x);

    const heightSpan = Math.max(...bottoms) - Math.min(...tops);
    const NODE_W = 190; // approx node width (positions are top-left corners)
    const area = (Math.max(...xs) - Math.min(...xs) + NODE_W) * heightSpan;

    // Healthy ≈ 3.7k tall / ≈4.1M area with the full responsive furniture; the divergence bug
    // was ≈28.6k tall / ≈25M area. Thresholds sit above healthy (headroom for more nodes) yet
    // far below the blow-up, so they still fail loudly if the relaxation ever diverges again.
    expect(heightSpan).toBeLessThan(6000);
    expect(area).toBeLessThan(8_000_000);

    // And no single node is an outlier: every node's top sits within the overall height span
    // (i.e. the box genuinely contains them all, not a tight cluster + one escapee).
    const top0 = Math.min(...tops);
    tops.forEach((y) => expect(y - top0).toBeLessThanOrEqual(heightSpan));
  });

  it("de-tall pass rebalances the fan-out into a landscape (~golden-ratio) box", () => {
    const doc = fixtureManorDoc();
    const byId = new Map(doc.nodes.map((n) => [n.id, n]));
    const pos = organizePositions(doc);
    const entries = Object.values(pos);
    const ids = Object.keys(pos);
    const xs = entries.map((p) => p.x);
    const tops = entries.map((p) => p.y);
    const bottoms = ids.map((id, i) => entries[i].y + estimateHeight(byId.get(id)!));
    const width = Math.max(...xs) - Math.min(...xs) + 190; // + approx node width
    const height = Math.max(...bottoms) - Math.min(...tops);
    // The manor was strongly PORTRAIT (one ~30-node terminal furniture column). The de-tall pass
    // wraps the fan-out so the box reads landscape and near the golden ratio — not a skyscraper.
    expect(width).toBeGreaterThan(height); // landscape
    expect(width / height).toBeGreaterThan(1.2);
    expect(width / height).toBeLessThan(2.6); // …but not absurdly wide
  });

  it("organizedDoc bakes the layout into every node's ui without mutating the input", () => {
    const before = sample();
    const out = organizedDoc(before);
    const pos = organizePositions(before);
    // Every node gets its organized position as ui.
    out.nodes.forEach((n) => expect(n.ui).toEqual(pos[n.id]));
    // The input doc is untouched (pure transform — samples are loaded fresh each time).
    expect(before.nodes.every((n) => n.ui === undefined)).toBe(true);
  });
});
