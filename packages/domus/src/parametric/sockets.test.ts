import { describe, expect, it } from "vitest";

import { outSocketOf, socketsMatch, summarize } from "./sockets";
import { DocNode, ParametricDoc } from "./types";

const doc = (nodes: DocNode[], components?: ParametricDoc["components"]): ParametricDoc => ({
  name: "t",
  tile: 1,
  nodes,
  ...(components ? { components } : {}),
});

describe("outSocketOf", () => {
  it("picks the first colour-typed output (rect → out, door → opening)", () => {
    expect(outSocketOf({ id: "r", kind: "rect", props: {} })).toEqual(["out", "rect"]);
    expect(outSocketOf({ id: "d", kind: "door", props: {} })?.[1]).toBe("opening");
  });

  it("returns undefined when no output has a socket colour (placements-only)", () => {
    expect(outSocketOf({ id: "f", kind: "floor", props: {} })).toBeUndefined();
  });

  it("an interface `input` node exposes its DECLARED type (doc 18)", () => {
    const node: DocNode = { id: "in-1", kind: "input", props: { name: "region", type: "rect" } };
    expect(outSocketOf(node)).toEqual(["out", "rect"]);
  });
});

describe("socketsMatch", () => {
  const d = doc([
    { id: "rect-1", kind: "rect", props: {} },
    { id: "point-1", kind: "point", props: {} },
    { id: "floor-1", kind: "floor", props: {} },
    { id: "door-1", kind: "door", props: {} },
    { id: "walls-1", kind: "walls", props: {} },
  ]);

  it("accepts a type-matching connection (rect → floor.rect)", () => {
    expect(socketsMatch(d, "rect-1", "out", "floor-1", "rect")).toBe(true);
  });

  it("rejects a type mismatch (point → floor.rect)", () => {
    expect(socketsMatch(d, "point-1", "out", "floor-1", "rect")).toBe(false);
  });

  it("honours a named source handle (door.opening → walls.holes)", () => {
    expect(socketsMatch(d, "door-1", "opening", "walls-1", "holes")).toBe(true);
  });

  it("is false for unknown nodes/handles", () => {
    expect(socketsMatch(d, "nope", "out", "floor-1", "rect")).toBe(false);
    expect(socketsMatch(d, "rect-1", "out", "floor-1", "bogus")).toBe(false);
  });
});

describe("summarize", () => {
  it("formats a rect from its position/size points", () => {
    const rect: DocNode = {
      id: "r",
      kind: "rect",
      props: { position: { x: -3, y: 0, z: -2.5 }, size: { x: 6, y: 0, z: 5 } },
    };
    expect(summarize(rect)).toBe("6×5m @ (-3, -2.5)");
  });

  it("formats a point and falls back to a generator's block id", () => {
    expect(summarize({ id: "p", kind: "point", props: { x: 1, z: 2 } })).toBe("@ (1, 2)");
    expect(summarize({ id: "s", kind: "spawn", props: { block: "table" } })).toBe("table");
  });
});
