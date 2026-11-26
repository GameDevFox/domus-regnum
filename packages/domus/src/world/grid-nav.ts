import { Vector3 } from "three";

import { NavMesh, buildNavMesh } from "./navmesh";

// A synthetic, uniform flat grid navmesh on the XZ plane — decoupled from domus's real floor
// graphs. Nodes sit at `id = row * cols + col`; links are 4-connected (right + down).
export type GridNav = NavMesh & {
  cols: number;
  rows: number;
};

export const buildGridNav = (cols: number, rows: number, spacing = 1): GridNav => {
  const id = (c: number, r: number) => r * cols + c;
  const nodes: Vector3[] = [];
  const edges: [number, number][] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      nodes[id(c, r)] = new Vector3(c * spacing, 0, r * spacing);
    }
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (c < cols - 1) edges.push([id(c, r), id(c + 1, r)]);
      if (r < rows - 1) edges.push([id(c, r), id(c, r + 1)]);
    }
  }

  return { ...buildNavMesh(nodes, edges), cols, rows };
};
