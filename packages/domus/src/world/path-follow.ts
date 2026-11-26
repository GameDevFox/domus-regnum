import { Vector3 } from "three";

// Pure polyline math for moving a point along a path. No rendering, no time — just geometry,
// so it's trivially unit-testable. The agent state machine layers movement on top of this.

// Total length of a polyline (sum of its segment lengths). Empty/single-point path => 0.
export const pathLength = (path: Vector3[]): number => {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += path[i].distanceTo(path[i - 1]);
  return total;
};

// The point reached after travelling `distance` along the polyline, clamped to [start, end].
// Returns a FRESH Vector3 and never mutates the input path.
export const pointAtDistance = (path: Vector3[], distance: number): Vector3 => {
  if (path.length === 0) throw new Error("pointAtDistance: empty path");
  if (path.length === 1 || distance <= 0) return path[0].clone();

  let remaining = distance;
  for (let i = 1; i < path.length; i++) {
    const segment = path[i].distanceTo(path[i - 1]);
    if (remaining <= segment) {
      const t = segment === 0 ? 0 : remaining / segment;
      return path[i - 1].clone().lerp(path[i], t);
    }
    remaining -= segment;
  }

  // distance exceeds the path length — clamp to the final point.
  return path[path.length - 1].clone();
};
