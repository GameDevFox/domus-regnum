import { describe, expect, it } from "vitest";

import { nodeSchema, resolveSchema } from "./resolve";
import { DocNode } from "./types";

// The interface kinds (doc 18) carry their real socket type in a `type` PROP, not the static schema.
// `nodeSchema` surfaces it so the editor draws a typed handle on an `input`'s output / `output`'s sink.

describe("nodeSchema (interface socket typing, doc 18)", () => {
  it("an `input` node's `out` takes its declared type (so it gets a colored output handle)", () => {
    const node: DocNode = { id: "in-1", kind: "input", props: { name: "region", type: "rect" } };
    expect(nodeSchema(node)?.outputs.out.type).toBe("rect");
    // The static schema (no node context) leaves it the permissive placeholder.
    expect(resolveSchema("input")?.outputs.out.type).toBe("json");
  });

  it("an `input`'s `default` socket adopts the declared type — connector-only for complex types", () => {
    const node: DocNode = { id: "in-1", kind: "input", props: { name: "region", type: "rect" } };
    const def = nodeSchema(node)?.inputs.default;
    expect(def?.type).toBe("rect"); // typed, so it gets a matching connector
    expect(def?.inline).toBe(false); // no literal field — wire a fallback rect into it
  });

  it("an `input`'s `default` stays an inline field for scalar/compound-literal types", () => {
    const num = nodeSchema({ id: "in-1", kind: "input", props: { name: "n", type: "number" } });
    expect(num?.inputs.default.type).toBe("number");
    expect(num?.inputs.default.inline).toBe(true);
    const meas = nodeSchema({ id: "in-2", kind: "input", props: { name: "m", type: "measure" } });
    expect(meas?.inputs.default.inline).toBe(true);
  });

  it("an `output` node's `in` sink takes its declared type", () => {
    const node: DocNode = { id: "out-1", kind: "output", props: { name: "p", type: "point" } };
    expect(nodeSchema(node)?.inputs.in.type).toBe("point");
  });

  it("a missing/blank declared type falls back to the static schema", () => {
    const node: DocNode = { id: "in-1", kind: "input", props: { name: "region" } };
    expect(nodeSchema(node)?.outputs.out.type).toBe("json");
  });

  it("an ordinary node resolves exactly as resolveSchema", () => {
    const node: DocNode = { id: "rect-1", kind: "rect", props: {} };
    expect(nodeSchema(node)).toEqual(resolveSchema("rect"));
  });
});
