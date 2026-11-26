import createGraph, { Graph, Link, Node, NodeId } from "ngraph.graph";
import { aStar } from "ngraph.path";
import { Vector3 } from "three";

import { ZERO } from "../constants";

type GraphGridOptions = {
  origin: Vector3,
};

const graphGridOptionDefaults: GraphGridOptions = {
  origin: ZERO,
};

export const distance = (_from: Node<Vector3>, _to: Node<Vector3>, link: Link<number>) => {
  if(!link.data)
    link.data = _from.data.distanceTo(_to.data);

  // console.log("link.data.distance", link.data.distance);
  return link.data as number;
};

export const heuristic = (from: Node<Vector3>, to: Node<Vector3>) => {
  const heuristic = from.data.distanceTo(to.data);
  // console.log("heuristic", heuristic);
  return heuristic;
};

export const getNodeIdFromVec = (x: number, y: number, width: number) => {
  return y * width + x;
};

export const buildFindPath = (graph: Graph<Vector3, number>) => {
  const { find } = aStar(graph, {
    // TODO: Implement this option
    // oriented: true,

    distance,
    heuristic,
  });

  const findPath = (from: NodeId, to: NodeId) => {
    const result = find(from, to);

    if(result.length && result[0].id !== from)
      result.reverse();

    return result;
  };

  return findPath;
};

export const GraphGrid = (width: number, height: number, options?: GraphGridOptions) => {
  const { origin } = { ...graphGridOptionDefaults, ...options };

  const graph = createGraph<Vector3, number>();

  for(let y=0; y<height; y++) {
    for(let x=0; x<width; x++) {
      const id = getNodeIdFromVec(x, y, width);
      const vec = new Vector3(x * 0.5, 0, y * 0.5).add(origin);

      // Add node
      // console.log("id", id, vec);
      graph.addNode(id, vec);

      // Add edges
      // Down
      if(y !== height - 1)
        graph.addLink(id, id + width);
      // Right
      if(x !== width - 1)
          graph.addLink(id, id + 1);

      // Down-Right
      if(y !== height - 1 && x !== width - 1)
        graph.addLink(id, id + width + 1);
      // Up-Right
      if(y !== 0 && x !== width - 1)
        graph.addLink(id, id - width + 1);

      // Bi-directional links
      // Only needed if graph is `oriented: true`
      // ========================================
      // // Up
      // if(y !== 0)
      //     graph.addLink(id, id - width);
      // // Left
      // if(x !== 0)
      //     graph.addLink(id, id - 1);

      // // Up-Left
      // if(y !== 0 && x !== 0)
      //   graph.addLink(id, id - width - 1);
      // // Down-Left
      // if(y !== height - 1 && x !== 0)
      //   graph.addLink(id, id + width - 1);

    }
  }

  const findPath = buildFindPath(graph);

  return {
    graph, findPath,
    width, height,
  };
};
