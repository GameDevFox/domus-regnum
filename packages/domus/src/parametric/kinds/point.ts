import { NodeKind, Point } from "../types";

// The second primitive: a single position + elevation, in WORLD METERS (doc v2; fractional
// values legal). Outputs one point object (fresh per recompute, like rect). Two points wired
// into a `wall` node define an individual wall run — move a point (G / the Move tool) and the
// wall follows. No size, so no Scale.
export const pointKind: NodeKind = {
  // Every coordinate is INLINE: an editable field on the node card whose row doubles as a target
  // socket for dynamic binding. Coordinates are Three.js world space (doc v4): x = world X, y =
  // world Y (height, usually 0), z = world Z (floor depth) — keys ARE the world axes, no remap.
  inputs: {
    x: { type: "number", default: 0, inline: true },
    y: { type: "number", default: 0, inline: true },
    z: { type: "number", default: 0, inline: true },
  },
  outputs: { out: { type: "point" } },
  build: (scope, { x, y, z }) => ({
    out: scope.computed<Point>((use) => ({
      x: use(x) as number,
      y: use(y) as number,
      z: use(z) as number,
    })),
  }),
};
