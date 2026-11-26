import createGraph, { Link, Node } from "ngraph.graph";
import { aStar } from "ngraph.path";
import { Vector3 } from "three";

import { Nav, NodeId } from "./nav";

// A navmesh: a Nav (A* pathfinding) plus the raw nodes/edges so a view can draw it as a wireframe.
// `edges` index into `nodes` (for drawing); the pathfinding node ids default to the array index but
// callers can pass explicit `ids` (e.g. the level navmesh uses "c,r,y" coordinate keys so stacked
// floors stay distinct). Works in 3D — link costs use full Vector3 distance, so a sloped ramp edge
// costs its true length.
//
// When `oriented` is true each [a, b] edge is ONE-WAY (a -> b) and pathfinding respects direction
// — so a bidirectional connection needs both [a, b] and [b, a]. Default (false) treats every edge
// as two-way.
export type NavMesh = {
  nav: Nav;
  nodes: Vector3[];
  edges: [number, number][];
  oriented: boolean; // true => edges are one-way (a view can draw direction arrows)
};

export const buildNavMesh = (
  nodes: Vector3[],
  edges: [number, number][],
  oriented = false,
  ids: NodeId[] = nodes.map((_, i) => i),
): NavMesh => {
  const graph = createGraph<Vector3, number>();
  nodes.forEach((pos, i) => graph.addNode(ids[i], pos));
  edges.forEach(([a, b]) => graph.addLink(ids[a], ids[b]));

  const distance = (from: Node<Vector3>, to: Node<Vector3>, link: Link<number>) => {
    if (link.data == null) link.data = from.data.distanceTo(to.data);
    return link.data;
  };
  const heuristic = (from: Node<Vector3>, to: Node<Vector3>) => from.data.distanceTo(to.data);
  const finder = aStar(graph, { distance, heuristic, oriented });

  const nav: Nav = {
    nodeIds: ids,
    positionOf: (id) => graph.getNode(id)!.data.clone(),
    findPath: (from, to) => {
      const result = finder.find(from, to);
      if (result.length && result[0].id !== from) result.reverse(); // ngraph returns to->from
      return result.map((n) => n.data.clone());
    },
    findNodePath: (from, to) => {
      const result = finder.find(from, to);
      if (result.length && result[0].id !== from) result.reverse();
      return result.map((n) => n.id);
    },
  };

  return { nav, nodes, edges, oriented };
};
