import { setPointAxis, setProp } from "./edit";
import { DocNode, ParametricDoc } from "./types";

// Reading a primitive node's world-space coordinates in doc v5 terms. Positional coords NEST under a
// point-typed prop for rect/anchor (`position`) and offset (`delta`); `point` keeps them top-level.
// A rect's extents live under `size` (x = width, z = depth). Shared by the viewport Move/Scale tool
// (level-editor) and node focus framing (node-focus) so the v5 shape lives in ONE place.

// One axis (x/y/z) of a point-typed prop (e.g. rect's `position`/`size`), with a fallback.
export const pointAxis = (
  node: DocNode,
  prop: string,
  axis: "x" | "y" | "z",
  def: number,
): number => {
  const p = node.props[prop] as Record<string, unknown> | undefined;
  return p && typeof p[axis] === "number" ? (p[axis] as number) : def;
};

// Where a kind keeps its positional coords: nested for rect/anchor/offset, top-level for point.
const POS_PROP: Record<string, string> = { rect: "position", anchor: "position", offset: "delta" };

// One axis of a primitive's POSITION, resolving the per-kind nesting (rect/anchor → `position.*`,
// point → top-level `*`).
export const primCoord = (node: DocNode, axis: "x" | "y" | "z", def: number): number => {
  const prop = POS_PROP[node.kind];
  if (prop) return pointAxis(node, prop, axis, def);
  const v = node.props[axis];
  return typeof v === "number" ? v : def;
};

// Write one axis of a primitive's POSITION, matching the per-kind shape (point inputs are wholesale,
// so the nested write merges the other axes — see setPointAxis).
export const setPrimCoord = (
  d: ParametricDoc,
  id: string,
  kind: string,
  axis: "x" | "y" | "z",
  value: number,
): ParametricDoc =>
  POS_PROP[kind] ? setPointAxis(d, id, POS_PROP[kind], axis, value) : setProp(d, id, axis, value);
