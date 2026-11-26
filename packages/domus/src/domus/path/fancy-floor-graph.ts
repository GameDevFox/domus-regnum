import { range } from "lodash";
import createGraph, { NodeId } from "ngraph.graph";
import { Vector3 } from "three";

import data from "./fancy-floor-graph-data.json";
import { buildFindPath } from "./graph-grid";

export const graph = createGraph<Vector3, number>();

let i = 0;

const allPoints: Record<number, Vector3> = [];

// 19 * 23
const width = 19;

for(const coords of data) {
  const nodeId = i++;
  const vec = new Vector3(coords.x, coords.y, coords.z);

  // Filter
  graph.addNode(nodeId, vec);
  allPoints[nodeId] = vec;
}

const removeNode = (nodeId: number) => {
  graph.removeNode(nodeId)
  delete allPoints[nodeId];
}

// TODO: Fix the scan process so it's smart enough to
// detect edge nodes based on adjacent nodes
// Remove nodes
range(width * 3 + 3, width * 3 + 7).forEach(removeNode);
range(width * 3 + 12, width * 3 + 16).forEach(removeNode);

let base = 79;
for(let i = 0; i < 7; i++) {
  [base, base + 1, base + 7, base + 8].forEach(removeNode);
  base += 15;
}

range(base - 2, base + 3, 2).forEach(removeNode);
range(base + 3, base + 8).forEach(removeNode)
range(base + 13, base + 17).forEach(removeNode)
range(base + 17, base + 25, 2).forEach(removeNode)

base += 30

for(let i = 0; i < 11; i++) {
  removeNode(base);
  removeNode(base + 13);
  base += 27;
}

// Add links
// const maxAdjacentDistance = ZERO.distanceTo(new Vector3(0.5, 0.5, 0.5));
// console.log(maxAdjacentDistance);

const maxDistance = 0.9;

Object.entries(allPoints).forEach(([nodeId, point]) => {
  const closePoints = Object.entries(allPoints).filter(([, p]) => {
    const distance = p.distanceTo(point);
    return distance > 0.1 && distance < maxDistance;
  });

  closePoints.forEach(([closeId]) => {
    if(nodeId < closeId)
      graph.addLink(parseInt(nodeId), parseInt(closeId));
  });
});

export const findPath = buildFindPath(graph);

// Removed edges to avoid clipping
const edgeNodeIds: NodeId[] = [];
graph.forEachNode(node => {
  if(!node.links)
    return;

  if(node.links.size <= 6)
    edgeNodeIds.push(node.id);
});

edgeNodeIds.forEach(nodeId => {
  graph.removeNode(nodeId);
});
