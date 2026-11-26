import { afterEach, describe, expect, it, vi } from "vitest";

import { Scope } from "@kitsune/common-web/src/scope";
import { Value } from "@kitsune/common-web/src/value";

import { GridPlacement, Placement } from "../blocks/types";

import { evaluateDoc } from "./evaluate";
import { ParametricDoc } from "./types";

// Phase 1 of docs/design/18 — author-composable components, headless. A component definition is a
// named sub-graph (`input`/`output` interface nodes); an instance node references it by name; the
// evaluator expands the definition in a fresh scope, seeding inputs and namespacing placements.

const rectProps = { position: { x: 0, y: 0, z: 0 }, size: { x: 6, y: 0, z: 6 } };

// Geometry signature ignoring the id — so we can compare a component's namespaced output against the
// equivalent flat graph.
const sig = (p: Placement) => JSON.stringify({ ...p, id: undefined });

afterEach(() => vi.restoreAllMocks());

describe("composable components (doc 18, headless)", () => {
  it("a component wrapping `walls` yields the same blocks, namespaced under the instance", () => {
    // The dogfood: a `Walls` component is just `input region → walls`. Its placements auto-aggregate
    // (like the top-level doc), so no output node is needed for them.
    const componentDoc: ParametricDoc = {
      name: "comp",
      tile: 1,
      components: [
        {
          name: "Walls",
          nodes: [
            { id: "region", kind: "input", props: { name: "region", type: "rect" } },
            { id: "w", kind: "walls", props: { rect: { bind: "region" } } },
          ],
        },
      ],
      nodes: [
        { id: "rect-1", kind: "rect", props: rectProps },
        { id: "walls-1", kind: "Walls", props: { region: { bind: "rect-1" } } },
      ],
    };
    // The equivalent flat graph: rect → walls directly.
    const flatDoc: ParametricDoc = {
      name: "flat",
      tile: 1,
      nodes: [
        { id: "rect-1", kind: "rect", props: rectProps },
        { id: "w", kind: "walls", props: { rect: { bind: "rect-1" } } },
      ],
    };

    const comp = evaluateDoc(Scope(), componentDoc).placements.peek();
    const flat = evaluateDoc(Scope(), flatDoc).placements.peek();

    expect(flat.length).toBeGreaterThan(0);
    expect(comp.length).toBe(flat.length);
    // Every placement is namespaced under the instance and its internal node: `walls-1/w/<localKey>`.
    comp.forEach((p) => expect(p.id?.startsWith("walls-1/w/")).toBe(true));
    // Same geometry as the flat graph, modulo the id prefix.
    expect(comp.map(sig).sort()).toEqual(flat.map(sig).sort());
  });

  it("a component's named (non-placement) output flows to a downstream node", () => {
    // `Pass`: input rect → output rect (identity). A floor consumes the instance's `out`.
    const doc: ParametricDoc = {
      name: "pass",
      tile: 1,
      components: [
        {
          name: "Pass",
          nodes: [
            { id: "r", kind: "input", props: { name: "r", type: "rect" } },
            { id: "o", kind: "output", props: { name: "out", type: "rect", in: { bind: "r" } } },
          ],
        },
      ],
      nodes: [
        { id: "rect-1", kind: "rect", props: rectProps },
        { id: "pass-1", kind: "Pass", props: { r: { bind: "rect-1" } } },
        { id: "floor-1", kind: "floor", props: { rect: { bind: "pass-1", output: "out" } } },
      ],
    };

    const all = evaluateDoc(Scope(), doc).placements.peek();
    const floor = all.find((p) => p.block === "floor") as GridPlacement | undefined;
    expect(floor).toBeTruthy();
    expect(floor!.size).toEqual([6, 6]); // the rect flowed through the component's output
    expect(floor!.id?.startsWith("floor-1/")).toBe(true); // a top-level node, not namespaced
  });

  it("reseeding an instance's input re-flows the sub-graph (reactive, no rebuild)", () => {
    const docV: ParametricDoc = {
      name: "react",
      tile: 1,
      components: [
        {
          name: "Pass",
          nodes: [
            { id: "r", kind: "input", props: { name: "r", type: "rect" } },
            { id: "o", kind: "output", props: { name: "out", type: "rect", in: { bind: "r" } } },
          ],
        },
      ],
      nodes: [
        { id: "rect-1", kind: "rect", props: rectProps },
        { id: "pass-1", kind: "Pass", props: { r: { bind: "rect-1" } } },
        { id: "floor-1", kind: "floor", props: { rect: { bind: "pass-1", output: "out" } } },
      ],
    };

    const scope = Scope();
    const v = Value(docV);
    const { placements } = evaluateDoc(scope, v);
    const widthOf = () =>
      (placements.peek().find((p) => p.block === "floor") as GridPlacement).size![0];
    expect(widthOf()).toBe(6);

    // A LITERAL edit to the instance's upstream rect — the hot path; flows through the component.
    v.set({
      ...docV,
      nodes: docV.nodes.map((n) =>
        n.id === "rect-1"
          ? { ...n, props: { ...rectProps, size: { x: 10, y: 0, z: 6 } } }
          : n,
      ),
    });
    expect(widthOf()).toBe(10);
  });

  it("components nest: an instance inside a definition namespaces ids by the whole path", () => {
    // Outer wraps Inner wraps `walls`. The instance path stacks: outer-1 → inner-1 → w.
    const doc: ParametricDoc = {
      name: "nest",
      tile: 1,
      components: [
        {
          name: "Inner",
          nodes: [
            { id: "region", kind: "input", props: { name: "region", type: "rect" } },
            { id: "w", kind: "walls", props: { rect: { bind: "region" } } },
          ],
        },
        {
          name: "Outer",
          nodes: [
            { id: "region", kind: "input", props: { name: "region", type: "rect" } },
            { id: "inner-1", kind: "Inner", props: { region: { bind: "region" } } },
          ],
        },
      ],
      nodes: [
        { id: "rect-1", kind: "rect", props: rectProps },
        { id: "outer-1", kind: "Outer", props: { region: { bind: "rect-1" } } },
      ],
    };
    const flat: ParametricDoc = {
      name: "flat",
      tile: 1,
      nodes: [
        { id: "rect-1", kind: "rect", props: rectProps },
        { id: "w", kind: "walls", props: { rect: { bind: "rect-1" } } },
      ],
    };

    const nested = evaluateDoc(Scope(), doc).placements.peek();
    const direct = evaluateDoc(Scope(), flat).placements.peek();
    expect(nested.length).toBe(direct.length);
    expect(nested.length).toBeGreaterThan(0);
    nested.forEach((p) => expect(p.id?.startsWith("outer-1/inner-1/w/")).toBe(true)); // full path
    expect(nested.map(sig).sort()).toEqual(direct.map(sig).sort());
  });

  it("a self-instantiating definition is caught (cycle), not a stack overflow", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const doc: ParametricDoc = {
      name: "loop",
      tile: 1,
      components: [{ name: "Loop", nodes: [{ id: "self", kind: "Loop", props: {} }] }],
      nodes: [{ id: "loop-1", kind: "Loop", props: {} }],
    };
    const placements = evaluateDoc(Scope(), doc).placements.peek();
    expect(placements).toEqual([]); // no geometry, and crucially no crash
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("definition cycle"));
  });
});
