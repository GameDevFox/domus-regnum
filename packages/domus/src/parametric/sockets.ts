import { pointAxis, primCoord } from "./prim-coords";
import { nodeSchema } from "./resolve";
import { ComponentDef, DocNode, ParametricDoc } from "./types";

// Pure socket-system facts for the node-graph editor (no React/xyflow): the type→color palette, a
// node's wireable output, connection type-validation, and the one-line node summary. Shared by the
// canvas (NodeCanvas) and unit-testable on their own.

// Blender-style socket colors — one hue per type, so which ports accept which noodles reads at a
// glance (rect ≈ amber regions, point ≈ purple positions, number ≈ gray scalars). Noodles tint to
// their source socket's color.
export const SOCKET_COLORS: Record<string, string> = {
  rect: "#cc8f4a",
  point: "#9a76c8",
  number: "#9a9aa4",
  string: "#5fb7c4",
  measure: "#cbb24f", // gold — a length taken against another length
  finish: "#b06f4f", // terracotta — a wall finish bundle
  opening: "#7fae62",
  frame: "#c97b9d",
  frames: "#c97b9d",
};

// A node's wireable output: the first output whose type has a socket color (most kinds' is the
// default "out"; the door/window kinds' is "opening" — placements outputs have no handle). Uses
// `nodeSchema` so an interface `input` node exposes a handle of its DECLARED type (doc 18).
export const outSocketOf = (
  node: DocNode,
  components?: ComponentDef[],
): [name: string, type: string] | undefined => {
  for (const [name, spec] of Object.entries(nodeSchema(node, components)?.outputs ?? {}))
    if (SOCKET_COLORS[spec.type]) return [name, spec.type];
  return undefined;
};

// A noodle may only land on a type-matching socket: the source's output type must equal the target
// input's declared type (rect → rect, point → a/b, number → thickness). Component instances +
// interface nodes resolve their sockets from `nodeSchema`. Takes plain ids/handles so it stays free
// of the canvas's Edge/Connection types.
export const socketsMatch = (
  doc: ParametricDoc,
  source: string | null | undefined,
  sourceHandle: string | null | undefined,
  target: string | null | undefined,
  targetHandle: string | null | undefined,
): boolean => {
  const src = doc.nodes.find((n) => n.id === source);
  const tgt = doc.nodes.find((n) => n.id === target);
  const out = src && nodeSchema(src, doc.components)?.outputs[sourceHandle ?? "out"]?.type;
  const inType = tgt && nodeSchema(tgt, doc.components)?.inputs[targetHandle ?? ""]?.type;
  return !!out && out === inType;
};

// One-line summary under the node title — enough to tell rects apart without opening the inspector
// (generators just show their block kind override, if any). `fmt` trims float noise to mm so
// smooth-scaled rects stay readable.
const fmt = (v: number): string => String(Math.round(v * 1000) / 1000);
export const summarize = (node: DocNode): string => {
  if (node.kind === "rect")
    return `${fmt(pointAxis(node, "size", "x", 0.5))}×${fmt(pointAxis(node, "size", "z", 0.5))}m @ (${fmt(
      primCoord(node, "x", 0),
    )}, ${fmt(primCoord(node, "z", 0))})`;
  if (node.kind === "point") return `@ (${fmt(primCoord(node, "x", 0))}, ${fmt(primCoord(node, "z", 0))})`;
  const block = node.props.block;
  return typeof block === "string" ? block : "";
};
