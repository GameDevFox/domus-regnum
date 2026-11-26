import { PRIMITIVE_KINDS } from "./kinds";
import { pointAxis, primCoord } from "./prim-coords";
import { bindingsOf, DocNode, NodeId, ParametricDoc } from "./types";

// Where a parametric node "is" in the world, for camera framing: the midpoint of the
// primitives its value ultimately derives from (a primitive is its own spot; a wall is the
// midpoint of its two points; a door chains region → rect). Pure doc analysis — shared by the
// outliner's double-click framing and the Builder's Focus button.

// The primitives a node's value ultimately derives from (itself, if it is one).
export const dependencyPrimitives = (doc: ParametricDoc, node: DocNode): DocNode[] => {
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const found = new Map<NodeId, DocNode>();
  const visit = (n: DocNode, onPath: Set<NodeId>) => {
    if (PRIMITIVE_KINDS.has(n.kind)) {
      found.set(n.id, n);
      return;
    }
    bindingsOf(n.props)
      .map((b) => b.bind)
      .filter((d) => byId.has(d) && !onPath.has(d))
      .forEach((d) => visit(byId.get(d)!, new Set(onPath).add(d)));
  };
  visit(node, new Set([node.id]));
  return [...found.values()];
};

// The world-space focus point for a node: the average of its primitives' centers (rect center /
// point position, at their height). Null when nothing anchors it (e.g. an unwired generator).
// Primitive props are world meters in world space (doc v4): a rect's x/z is its NW CORNER on the
// floor (world X/Z), y is its height; so its center is corner + size/2. Points/anchors are as-is.
export const nodeFocusCenter = (
  doc: ParametricDoc,
  nodeId: NodeId,
): { x: number; y: number; z: number } | null => {
  const node = doc.nodes.find((n) => n.id === nodeId);
  if (!node) return null;
  const prims = dependencyPrimitives(doc, node);
  if (prims.length === 0) return null;
  const sum = { x: 0, y: 0, z: 0 };
  prims.forEach((prim) => {
    // doc v5: rect/anchor positions nest under `position`, a rect's extents under `size` (x=width,
    // z=depth); `point` keeps top-level coords. primCoord/pointAxis resolve the per-kind shape.
    const x = primCoord(prim, "x", 0);
    const z = primCoord(prim, "z", 0);
    const cx = prim.kind === "rect" ? x + pointAxis(prim, "size", "x", 0.5) / 2 : x;
    const cz = prim.kind === "rect" ? z + pointAxis(prim, "size", "z", 0.5) / 2 : z;
    sum.x += cx;
    sum.y += primCoord(prim, "y", 0); // height
    sum.z += cz;
  });
  return { x: sum.x / prims.length, y: sum.y / prims.length, z: sum.z / prims.length };
};
