import { describe, expect, it } from "vitest";

import { Scope } from "@kitsune/common-web/src/scope";

import { Placement } from "../blocks/types";

import { evaluateDoc } from "./evaluate";
import { groupNodes, isInstance, ungroupInstance } from "./group";
import { ParametricDoc } from "./types";

// Phase 3 of docs/design/18 — the grouping ops. The load-bearing property: grouping and ungrouping
// rearrange the GRAPH but never the derived geometry, so we compare evaluated placements (modulo id).

const rectProps = { position: { x: 0, y: 0, z: 0 }, size: { x: 6, y: 0, z: 6 } };

// A small room: one rect drives a floor, a wall perimeter, and a spawn.
const baseDoc = (): ParametricDoc => ({
  name: "room",
  tile: 1,
  nodes: [
    { id: "rect-1", kind: "rect", props: rectProps, ui: { x: 0, y: 0 } },
    { id: "floor-1", kind: "floor", props: { rect: { bind: "rect-1" } }, ui: { x: 240, y: 0 } },
    { id: "walls-1", kind: "walls", props: { rect: { bind: "rect-1" } }, ui: { x: 240, y: 80 } },
    {
      id: "spawn-1",
      kind: "spawn",
      props: { rect: { bind: "rect-1" }, block: "table" },
      ui: { x: 240, y: 160 },
    },
  ],
});

const sig = (p: Placement) => JSON.stringify({ ...p, id: undefined });
const geom = (doc: ParametricDoc) =>
  evaluateDoc(Scope(), doc)
    .placements.peek()
    .map(sig)
    .sort();

describe("grouping ops (doc 18, Phase 3)", () => {
  it("grouping a consumer (walls) preserves the derived geometry and builds the interface", () => {
    const before = geom(baseDoc());
    const doc = groupNodes(baseDoc(), ["walls-1"], "Perimeter");

    // One definition, one instance; the selected node is gone from the top level.
    expect(doc.components?.map((c) => c.name)).toEqual(["Perimeter"]);
    const instance = doc.nodes.find((n) => n.kind === "Perimeter");
    expect(instance).toBeTruthy();
    expect(doc.nodes.find((n) => n.id === "walls-1")).toBeUndefined();
    expect(isInstance(doc, instance!.id)).toBe(true);

    // The crossing edge walls-1.rect ← rect-1 became an `input`, fed by the instance.
    const def = doc.components![0];
    const input = def.nodes.find((n) => n.kind === "input");
    expect(input?.props).toMatchObject({ name: "rect", type: "rect" });
    expect(instance!.props.rect).toEqual({ bind: "rect-1" });

    expect(geom(doc)).toEqual(before); // geometry unchanged
  });

  it("grouping a source (rect) exposes it as an output that outside consumers rewire to", () => {
    const before = geom(baseDoc());
    const doc = groupNodes(baseDoc(), ["rect-1"], "Box");

    const def = doc.components![0];
    expect(def.nodes.some((n) => n.kind === "rect")).toBe(true);
    const out = def.nodes.find((n) => n.kind === "output");
    expect(out?.props.type).toBe("rect");

    // Every former rect-1 consumer now reads the instance's exposed output.
    const instance = doc.nodes.find((n) => n.kind === "Box")!;
    const outName = out!.props.name as string;
    for (const id of ["floor-1", "walls-1", "spawn-1"]) {
      expect(doc.nodes.find((n) => n.id === id)!.props.rect).toEqual({
        bind: instance.id,
        output: outName,
      });
    }
    expect(geom(doc)).toEqual(before);
  });

  it("ungrouping an instance restores the geometry and inlines the internals", () => {
    const before = geom(baseDoc());
    const grouped = groupNodes(baseDoc(), ["walls-1"], "Perimeter");
    const instance = grouped.nodes.find((n) => n.kind === "Perimeter")!;
    const exploded = ungroupInstance(grouped, instance.id);

    // The instance is gone; the inner `walls` node is inlined (id namespaced under the instance)
    // and bound straight back to rect-1.
    expect(exploded.nodes.find((n) => n.id === instance.id)).toBeUndefined();
    const walls = exploded.nodes.find((n) => n.kind === "walls");
    expect(walls).toBeTruthy();
    expect(walls!.id.startsWith(`${instance.id}/`)).toBe(true);
    expect(walls!.props.rect).toEqual({ bind: "rect-1" });

    expect(geom(exploded)).toEqual(before);
  });

  it("group → ungroup round-trips the geometry for both consumer and source groupings", () => {
    const before = geom(baseDoc());
    for (const sel of [["walls-1"], ["rect-1"], ["floor-1", "walls-1"]]) {
      const grouped = groupNodes(baseDoc(), sel, "Grp");
      const inst = grouped.nodes.find((n) => n.kind === "Grp")!;
      expect(geom(ungroupInstance(grouped, inst.id))).toEqual(before);
    }
  });

  it("refuses a name that collides with a built-in kind", () => {
    expect(() => groupNodes(baseDoc(), ["walls-1"], "walls")).toThrow(/already exists/);
  });

  it("ungroup is a no-op on a non-instance node", () => {
    const doc = baseDoc();
    expect(ungroupInstance(doc, "rect-1")).toBe(doc);
  });
});
