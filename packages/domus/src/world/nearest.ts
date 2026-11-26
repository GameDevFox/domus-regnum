import { Vector3 } from "three";

import { Nav, NodeId } from "./nav";

// THE shared selection rule for "closest bin / station / loose item" across the sims: nearest
// candidate by squared distance, tie-broken by id so equidistant candidates pick deterministically
// (the whole sim layer records/scrubs and unit-tests on that promise). Returns null when there
// are no candidates.
export const nearest = <T>(
  candidates: readonly T[],
  from: Vector3,
  positionOf: (c: T) => Vector3,
  idOf: (c: T) => string,
): T | null => {
  let best: T | null = null;
  let bestD = Infinity;
  for (const c of candidates) {
    const d = from.distanceToSquared(positionOf(c));
    if (d < bestD || (d === bestD && best !== null && idOf(c) < idOf(best))) {
      bestD = d;
      best = c;
    }
  }
  return best;
};

// Nearest of the common entity shape ({ id, position }) — items, bins, agents.
export const nearestEntity = <T extends { id: string; position: Vector3 }>(
  candidates: readonly T[],
  from: Vector3,
): T | null =>
  nearest(
    candidates,
    from,
    (c) => c.position,
    (c) => c.id,
  );

// Nearest node id, positions resolved through the nav port — stations, sources.
export const nearestNode = (
  candidates: readonly NodeId[],
  from: Vector3,
  nav: Nav,
): NodeId | null =>
  nearest(candidates, from, (c) => nav.positionOf(c), String);
