import { Vector3 } from "three";

export type NodeId = string | number;

// The navigation "port": the sim depends on this interface, not on any concrete graph. Production
// wires in an adapter over the real floor graph (GraphGrid / findPath); tests pass a tiny fixture.
// Keeping this seam is what lets the whole agent sim run headlessly in unit tests.
export type Nav = {
  // Every traversable node id — used to pick destinations.
  nodeIds: NodeId[];
  // World position of a node.
  positionOf: (id: NodeId) => Vector3;
  // A path from one node to another as a polyline of world positions (inclusive of both ends).
  // Returns fewer than 2 points if the agent is already there or the target is unreachable.
  findPath: (from: NodeId, to: NodeId) => Vector3[];
  // The same path as node ids (inclusive of both ends). Optional — only the real floor graph
  // provides it; it's what lets an agent stop one node short of a target (adjacent, not on top).
  findNodePath?: (from: NodeId, to: NodeId) => NodeId[];
};
