import { Level } from "../blocks/types";

import {
  Binding,
  bindingsOf,
  DocNode,
  isBinding,
  isBindingList,
  NodeId,
  ParametricDoc,
  PropValue,
} from "./types";

// Pure document-editing operations, mirroring blocks/edit.ts: docs are immutable values —
// every op returns a NEW doc — so the editor drives a reactive Value<ParametricDoc> and gets
// undo/redo for free from history.ts. No Three, no DOM: testable.

// First free "kind-n" id — short, stable, human-readable on the node canvas.
export const nextNodeId = (doc: ParametricDoc, kind: string): NodeId => {
  const taken = new Set(doc.nodes.map((n) => n.id));
  let n = 1;
  while (taken.has(`${kind}-${n}`)) n++;
  return `${kind}-${n}`;
};

export const addNode = (doc: ParametricDoc, node: DocNode): ParametricDoc => ({
  ...doc,
  nodes: [...doc.nodes, node],
});

// Removes the node AND strips any binding that pointed at it (the prop reverts to its kind
// default) — dependents keep evaluating instead of warning about a dangling source.
export const removeNode = (doc: ParametricDoc, id: NodeId): ParametricDoc => ({
  ...doc,
  nodes: doc.nodes
    .filter((n) => n.id !== id)
    .map((n) => {
      let changed = false;
      const props: Record<string, PropValue> = {};
      for (const [k, v] of Object.entries(n.props)) {
        if (isBinding(v) && v.bind === id) {
          changed = true; // drop the prop → reverts to the kind default
        } else if (isBindingList(v)) {
          // A MULTI input (e.g. walls/wall `holes`, instance `frames`): drop just the entries that
          // pointed at the removed node, collapse a 1-element list to a plain binding, unset if emptied.
          const rest = v.filter((b) => b.bind !== id);
          if (rest.length === v.length) props[k] = v;
          else {
            changed = true;
            if (rest.length === 1) props[k] = rest[0];
            else if (rest.length > 1) props[k] = rest;
            // rest.length === 0 → drop the prop
          }
        } else {
          props[k] = v;
        }
      }
      return changed ? { ...n, props } : n;
    }),
});

export const setProp = (
  doc: ParametricDoc,
  id: NodeId,
  name: string,
  value: PropValue,
): ParametricDoc => ({
  ...doc,
  nodes: doc.nodes.map((n) => (n.id === id ? { ...n, props: { ...n.props, [name]: value } } : n)),
});

// Set ONE axis (x/y/z) of a point-typed prop, preserving the other two. Point inputs are wholesale
// (you can't bind/set a single axis from the graph), so move/scale gestures and any "tweak one
// dimension" op merge through here. Starts from {0,0,0} if the prop is absent or currently bound.
export const setPointAxis = (
  doc: ParametricDoc,
  id: NodeId,
  name: string,
  axis: "x" | "y" | "z",
  value: number,
): ParametricDoc => {
  const cur = doc.nodes.find((n) => n.id === id)?.props[name];
  const base =
    cur !== undefined && !isBinding(cur) && !Array.isArray(cur) && typeof cur === "object"
      ? (cur as Record<string, number>)
      : {};
  return setProp(doc, id, name, { x: 0, y: 0, z: 0, ...base, [axis]: value });
};

// Clears a prop entirely — the kind's default applies again.
export const unsetProp = (doc: ParametricDoc, id: NodeId, name: string): ParametricDoc => ({
  ...doc,
  nodes: doc.nodes.map((n) => {
    if (n.id !== id || !(name in n.props)) return n;
    const props = { ...n.props };
    delete props[name];
    return { ...n, props };
  }),
});

// Rename a node (empty string clears back to showing the id). Labels are display-only — ids
// stay stable, so bindings and derived placement keys never move.
export const setNodeLabel = (doc: ParametricDoc, id: NodeId, label: string): ParametricDoc => ({
  ...doc,
  nodes: doc.nodes.map((n) =>
    n.id === id ? { ...n, label: label.trim() === "" ? undefined : label } : n,
  ),
});

export const setNodeUi = (
  doc: ParametricDoc,
  id: NodeId,
  ui: { x: number; y: number },
): ParametricDoc => ({
  ...doc,
  nodes: doc.nodes.map((n) => (n.id === id ? { ...n, ui } : n)),
});

// Would wiring `nodeId.prop ← binding` create a cycle? True if the binding's source already
// depends (transitively) on nodeId — or is nodeId itself.
export const wouldCycle = (doc: ParametricDoc, nodeId: NodeId, binding: Binding): boolean => {
  if (binding.bind === nodeId) return true;
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const seen = new Set<NodeId>();
  const reaches = (from: NodeId): boolean => {
    if (from === nodeId) return true;
    if (seen.has(from)) return false;
    seen.add(from);
    const node = byId.get(from);
    if (!node) return false;
    return bindingsOf(node.props).some((b) => reaches(b.bind));
  };
  return reaches(binding.bind);
};

// Wires a prop to another node's output. Throws on a cycle — the UI should grey the socket
// out via wouldCycle before offering the connection.
export const wire = (
  doc: ParametricDoc,
  id: NodeId,
  name: string,
  binding: Binding,
): ParametricDoc => {
  if (wouldCycle(doc, id, binding))
    throw new Error(`wire: ${id}.${name} ← ${binding.bind} would create a cycle`);
  return setProp(doc, id, name, binding);
};

// Append a binding to a MULTI input (InputSpec.multi — e.g. the walls' `holes`): an existing
// single binding becomes a list, a list grows, anything else is replaced. Cycle-guarded, and
// the same source.output is never added twice (re-connecting an existing noodle is a no-op).
export const wireAdd = (
  doc: ParametricDoc,
  id: NodeId,
  name: string,
  binding: Binding,
): ParametricDoc => {
  if (wouldCycle(doc, id, binding))
    throw new Error(`wireAdd: ${id}.${name} ← ${binding.bind} would create a cycle`);
  const prop = doc.nodes.find((n) => n.id === id)?.props[name];
  const existing =
    prop === undefined ? [] : isBinding(prop) ? [prop] : isBindingList(prop) ? prop : [];
  if (
    existing.some(
      (b) => b.bind === binding.bind && (b.output ?? "out") === (binding.output ?? "out"),
    )
  )
    return doc;
  const next = [...existing, binding];
  return setProp(doc, id, name, next.length === 1 ? next[0] : next);
};

// Remove ONE binding (matched by source + output) from a single- or multi-bound prop; a list
// of one collapses back to a plain binding, an emptied prop is unset.
export const unwireOne = (
  doc: ParametricDoc,
  id: NodeId,
  name: string,
  binding: Pick<Binding, "bind" | "output">,
): ParametricDoc => {
  const prop = doc.nodes.find((n) => n.id === id)?.props[name];
  const matches = (b: Binding) =>
    b.bind === binding.bind && (b.output ?? "out") === (binding.output ?? "out");
  if (prop !== undefined && isBinding(prop)) return matches(prop) ? unsetProp(doc, id, name) : doc;
  if (prop !== undefined && isBindingList(prop)) {
    const rest = prop.filter((b) => !matches(b));
    if (rest.length === prop.length) return doc;
    return rest.length === 0
      ? unsetProp(doc, id, name)
      : setProp(doc, id, name, rest.length === 1 ? rest[0] : rest);
  }
  return doc;
};

// --- (de)serialization ------------------------------------------------------------------

export const serializeDoc = (doc: ParametricDoc): string => JSON.stringify(doc);

// Pre-release there is NO doc versioning or migration — parse and shape-check only. Saved docs are
// disposable; a real release will add a version field + migrations when the format must survive
// upgrades. (Older saved shapes simply won't load correctly until then — by design.)
export const deserializeDoc = (s: string): ParametricDoc => {
  const parsed = JSON.parse(s) as ParametricDoc;
  if (!parsed || !Array.isArray(parsed.nodes))
    throw new Error("deserializeDoc: not a parametric doc");
  return parsed;
};

// The well-known node that holds hand-placed blocks (the editor's stamp tool writes here).
export const MANUAL_NODE_ID = "manual-1";

// An existing flat Level becomes a doc with one manual placements node — nothing is lost,
// and the level is immediately editable alongside parametric nodes. (Placements are
// cell-anchored as ever; only PRIMITIVE props carry meters, and this doc has none.)
export const levelToDoc = (level: Level): ParametricDoc => ({
  name: level.name,
  tile: level.tile,
  nodes: [
    {
      id: MANUAL_NODE_ID,
      kind: "placements",
      label: "Hand-placed",
      props: { list: level.placements as unknown as PropValue },
    },
  ],
});
