import { describe, expect, it } from "vitest";

import { Scope } from "@kitsune/common-web/src/scope";

import { onCell } from "../blocks/author";
import { Level } from "../blocks/types";

import {
  addNode,
  deserializeDoc,
  levelToDoc,
  nextNodeId,
  removeNode,
  serializeDoc,
  setProp,
  unsetProp,
  wire,
  wouldCycle,
} from "./edit";
import { evaluateDoc } from "./evaluate";
import { isBinding, ParametricDoc } from "./types";

const doc = (): ParametricDoc => ({
  name: "t",
  tile: 1,
  nodes: [
    { id: "rect-1", kind: "rect", props: { size: { x: 4, y: 0, z: 4 } } },
    { id: "floor-1", kind: "floor", props: { rect: { bind: "rect-1" } } },
  ],
});

describe("edit ops", () => {
  it("nextNodeId picks the first free kind-n", () => {
    expect(nextNodeId(doc(), "rect")).toBe("rect-2");
    expect(nextNodeId(doc(), "walls")).toBe("walls-1");
  });

  it("ops are immutable — the original doc is untouched", () => {
    const d = doc();
    setProp(d, "rect-1", "w", 9);
    removeNode(d, "rect-1");
    unsetProp(d, "floor-1", "rect");
    expect(d).toEqual(doc());
  });

  it("removeNode strips bindings that pointed at the removed node", () => {
    const d = removeNode(doc(), "rect-1");
    expect(d.nodes).toHaveLength(1);
    expect("rect" in d.nodes[0].props).toBe(false); // reverts to the kind default
  });

  it("removeNode strips the removed node from MULTI (binding-list) inputs", () => {
    // walls.holes is a multi input: two openings wired in, remove one → the list keeps the other
    // (collapsed to a plain binding), never a dangling {bind: <deleted>}.
    const multi = (): ParametricDoc => ({
      name: "t",
      tile: 1,
      nodes: [
        { id: "rect-1", kind: "rect", props: { size: { x: 4, y: 0, z: 4 } } },
        { id: "door-1", kind: "door", props: { rect: { bind: "rect-1" } } },
        { id: "door-2", kind: "door", props: { rect: { bind: "rect-1" } } },
        {
          id: "walls-1",
          kind: "walls",
          props: {
            rect: { bind: "rect-1" },
            holes: [
              { bind: "door-1", output: "opening" },
              { bind: "door-2", output: "opening" },
            ],
          },
        },
      ],
    });
    const d = removeNode(multi(), "door-1");
    const walls = d.nodes.find((n) => n.id === "walls-1")!;
    expect(walls.props.holes).toEqual({ bind: "door-2", output: "opening" }); // collapsed, no dangling door-1
  });

  it("wouldCycle catches self-binds and transitive cycles; wire throws on them", () => {
    const d = doc();
    expect(wouldCycle(d, "rect-1", { bind: "rect-1" })).toBe(true); // self
    expect(wouldCycle(d, "rect-1", { bind: "floor-1" })).toBe(true); // floor already depends on rect
    expect(wouldCycle(d, "floor-1", { bind: "rect-1" })).toBe(false); // existing edge re-wired is fine

    expect(() => wire(d, "rect-1", "x", { bind: "floor-1", path: "whatever" })).toThrow("cycle");
    const wired = wire(d, "floor-1", "block", { bind: "rect-1", path: "w" });
    expect(isBinding(wired.nodes[1].props.block)).toBe(true);
  });

  it("serialize/deserialize round-trips; deserialize rejects non-docs", () => {
    const d = addNode(doc(), { id: "spawn-1", kind: "spawn", props: {}, ui: { x: 40, y: 80 } });
    expect(deserializeDoc(serializeDoc(d))).toEqual(d);
    expect(() => deserializeDoc(JSON.stringify({ hello: "world" }))).toThrow("not a parametric");
  });
});

describe("levelToDoc", () => {
  it("a flat Level becomes one manual node that evaluates back to the same placements", () => {
    const level: Level = {
      name: "legacy",
      tile: 1,
      placements: [onCell("floor", [0, 0]), onCell("chair", [1, 2], { face: "S" })],
    };
    const migrated = levelToDoc(level);
    expect(migrated.nodes).toHaveLength(1);

    const scope = Scope();
    const { placements } = evaluateDoc(scope, migrated);
    const derived = placements.peek();
    // Same placements, plus the stamped in-memory ids (index-keyed under the manual node).
    expect(derived).toEqual(level.placements.map((p, i) => ({ ...p, id: `manual-1/${i}` })));
  });
});

describe("setNodeLabel", () => {
  it("renames a node; empty/whitespace clears back to the id", async () => {
    const { setNodeLabel } = await import("./edit");
    const d = doc();
    const named = setNodeLabel(d, "rect-1", "Great Hall");
    expect(named.nodes[0].label).toBe("Great Hall");
    expect(setNodeLabel(named, "rect-1", "   ").nodes[0].label).toBeUndefined();
    expect(d.nodes[0].label).toBeUndefined(); // immutable
  });
});
