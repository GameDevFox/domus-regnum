import { MANUAL_NODE_ID } from "../parametric/edit";
import { bindingsOf, DocNode, NodeId, ParametricDoc } from "../parametric/types";

// Pure row construction for the Builder outliner. The doc is a DAG, not a tree — a wall binds
// two points, a rect drives several generators — so a node can legitimately appear under more
// than one parent. Rows expand the DAG into a tree by walking the binding edges, in either
// direction:
//
//   "products" — roots are nodes nothing consumes (the visible scene); children are the nodes
//                they bind to (drill down into WHY: wall-1 ▸ point-1, point-2).
//   "sources"  — roots are nodes with no dependencies (the editable handles); children are
//                their consumers (drill down into WHAT THEY DRIVE: rect-1 ▸ floor-1, walls-1).
//
// Each occurrence carries a `path` (root-to-row id chain) so the panel can key React rows and
// expansion state per OCCURRENCE — expanding wall-1 under point-1 must not also expand it
// under point-2.

export type OutlinerDirection = "products" | "sources";

export type OutlinerRow = {
  node: DocNode;
  path: string; // "point-2/wall-1" — unique per occurrence
  children: OutlinerRow[];
};

const uniq = (ids: NodeId[]): NodeId[] => [...new Set(ids)];

// A node's dependencies: the nodes its props bind to (present in the doc; multi-bindings
// flattened — every door wired into a walls' holes is a dependency).
const depsOf = (node: DocNode, byId: Map<NodeId, DocNode>): NodeId[] =>
  uniq(bindingsOf(node.props).map((b) => b.bind).filter((id) => byId.has(id)));

export const buildOutlinerRows = (
  doc: ParametricDoc,
  direction: OutlinerDirection,
): OutlinerRow[] => {
  // The manual placements node has its own dedicated panel section.
  const nodes = doc.nodes.filter((n) => n.id !== MANUAL_NODE_ID);
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const deps = new Map(nodes.map((n) => [n.id, depsOf(n, byId)]));
  const consumers = new Map<NodeId, NodeId[]>(nodes.map((n) => [n.id, []]));
  nodes.forEach((n) => deps.get(n.id)!.forEach((d) => consumers.get(d)!.push(n.id)));

  const childrenOf = direction === "products" ? deps : consumers;
  const isRoot = (n: DocNode) =>
    (direction === "products" ? consumers : deps).get(n.id)!.length === 0;

  const seen = new Set<NodeId>();
  // `onPath` guards against malformed cycles (edit ops reject them, but a hand-edited doc
  // shouldn't hang the panel) — a node already on the current root-to-here chain is cut.
  const build = (id: NodeId, parentPath: string, onPath: Set<NodeId>): OutlinerRow => {
    seen.add(id);
    const path = parentPath ? `${parentPath}/${id}` : id;
    const nextOnPath = new Set(onPath).add(id);
    return {
      node: byId.get(id)!,
      path,
      children: childrenOf
        .get(id)!
        .filter((c) => !nextOnPath.has(c))
        .map((c) => build(c, path, nextOnPath)),
    };
  };

  const rows = nodes.filter(isRoot).map((n) => build(n.id, "", new Set()));
  // Cycle members are roots of nothing in either direction — surface them anyway.
  nodes.filter((n) => !seen.has(n.id)).forEach((n) => rows.push(build(n.id, "", new Set())));
  return rows;
};
