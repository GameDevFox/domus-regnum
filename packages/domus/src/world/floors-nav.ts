import { Vector3 } from "three";

import { NavMesh, buildNavMesh } from "./navmesh";

// Two stacked floors joined by a TWO-LANE ramp alongside their right edge: an "up" lane (one-way,
// lower -> upper) and a parallel "down" lane (one-way, upper -> lower). Because the mesh is
// oriented, ascending and descending traffic use separate lanes — agents flow in two streams.
// The graph stays strongly connected (you can always route down-then-up or up-then-down), so every
// node remains reachable. Exercises the sim and nav in 3D with directional edges.
export const buildTwoFloorNav = (
  cols: number,
  rows: number,
  height: number,
  spacing = 1,
): NavMesh => {
  const nodes: Vector3[] = [];
  const edges: [number, number][] = [];
  const link = (a: number, b: number) => edges.push([a, b]); // one-way a -> b
  const biLink = (a: number, b: number) => {
    edges.push([a, b]);
    edges.push([b, a]);
  };

  const floorSize = cols * rows;
  const lowerId = (c: number, r: number) => r * cols + c;
  const upperId = (c: number, r: number) => floorSize + r * cols + c;

  // Floors: 4-connected, two-way.
  const addFloor = (y: number, idAt: (c: number, r: number) => number) => {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        nodes[idAt(c, r)] = new Vector3(c * spacing, y, r * spacing);
      }
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (c < cols - 1) biLink(idAt(c, r), idAt(c + 1, r));
        if (r < rows - 1) biLink(idAt(c, r), idAt(c, r + 1));
      }
    }
  };
  addFloor(0, lowerId);
  addFloor(height, upperId);

  const rampY = (r: number) => (rows > 1 ? r / (rows - 1) : 0) * height;

  // Up lane (one-way, ascending), nearest the floors. Its foot and top are the shared two-way
  // landings with the lower/upper floors.
  const upBase = nodes.length;
  const upX = cols * spacing;
  for (let r = 0; r < rows; r++) {
    nodes[upBase + r] = new Vector3(upX, rampY(r), r * spacing);
    if (r > 0) link(upBase + r - 1, upBase + r); // up the slope
  }

  // Down lane (one-way, descending), one column further out.
  const downBase = nodes.length;
  const downX = (cols + 1) * spacing;
  for (let r = 0; r < rows; r++) {
    nodes[downBase + r] = new Vector3(downX, rampY(r), r * spacing);
    if (r > 0) link(downBase + r, downBase + r - 1); // down the slope
  }

  // Landings: the up lane's foot/top join the floors two-way; the down lane reaches the floors only
  // through the cross-rungs below — so no connector crosses a lane.
  biLink(lowerId(cols - 1, 0), upBase); // lower floor <-> foot landing
  biLink(upBase + rows - 1, upperId(cols - 1, rows - 1)); // top landing <-> upper floor

  // Rungs: a two-way link between the up and down lanes at every step (same elevation). The lanes
  // stay one-way along their length (so through-traffic keeps to its own lane, in two streams), but
  // an agent can step across at any step to reverse direction — like turning around on a staircase.
  for (let r = 0; r < rows; r++) biLink(upBase + r, downBase + r);

  return buildNavMesh(nodes, edges, true);
};
