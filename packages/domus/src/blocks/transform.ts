import { Object3D, Vector3 } from "three";

import { Cell, cellCenter, edgeMidpoint, edgeRotationY, facingRotationY } from "./grid";
import { isGridPlacement, Placement } from "./types";

// The world placement of a block: where it sits and how it's turned. Pure data so it's testable
// without touching Three's scene graph.
export type Transform = {
  position: Vector3;
  rotationY: number; // radians
};

// Resolve a placement (grid- or free-anchored) into a concrete world transform, given the level's
// tile size. This is the single place that knows how the abstract "cell / edge / facing" authoring
// vocabulary maps onto world coordinates — block factories never compute position themselves.
export const resolveTransform = (placement: Placement, tile: number): Transform => {
  if (!isGridPlacement(placement)) {
    const [x, y, z] = placement.pos;
    return { position: new Vector3(x, y, z), rotationY: placement.rotY ?? 0 };
  }

  // Grid-anchored. An `edge` puts the block on a cell boundary (walls/doorways) and rotates it to
  // run along that edge; otherwise it fills/centers the cell. A `face` orients a prop.
  const elevation = placement.y ?? 0; // multi-level: lift the cell plane to this world Y

  if (placement.edge) {
    const position = edgeMidpoint(placement.cell, placement.edge, tile);
    // A spanning edge block (span > 1) covers `span` cells along its run, so its center shifts half
    // the extra length along that run: +X for N/S edges, +Z for E/W edges.
    const span = placement.span ?? 1;
    if (span > 1) {
      const shift = ((span - 1) / 2) * tile;
      if (placement.edge === "N" || placement.edge === "S") position.x += shift;
      else position.z += shift;
    }
    position.y += elevation;
    return { position, rotationY: edgeRotationY(placement.edge) };
  }

  // A region (size [w,h]) is centered on its rectangle of cells, not its NW anchor cell. Single-cell
  // (no size / [1,1]) reduces to the plain cell center, so existing placements are unchanged.
  const [sw, sh] = placement.size ?? [1, 1];
  const center: Cell = [placement.cell[0] + (sw - 1) / 2, placement.cell[1] + (sh - 1) / 2];
  const position = cellCenter(center, tile);
  position.y += elevation;
  return {
    position,
    rotationY: placement.face ? facingRotationY(placement.face) : 0,
  };
};

// Apply a resolved transform to a built mesh in place. Kept separate from `resolveTransform` so the
// resolution stays pure/testable and only this tiny helper touches Three's mutable Object3D.
export const applyTransform = (mesh: Object3D, t: Transform): void => {
  mesh.position.copy(t.position);
  mesh.rotation.y = t.rotationY;
};
