import { BlockParams, Placement } from "../../blocks/types";
import { NodeKind, Point } from "../types";

import { aimRotY } from "../seg";
import { MIN_RUN_M } from "./constants";

// A guard railing between two point primitives, rendered point-to-point at ANY angle — one FREE
// (non-grid) railing mesh whose endpoints sit on the two points. The railing block is a textured
// frame extruded to a ~0.10 m depth with see-through gaps (blocks/kinds/structural.ts → Railing).
//
// Mirrors the two-point `wall` kind: no corner posts (a single run goes end to end), points may be
// fractional (nothing snaps here — the Move tool snaps its own drags), elevation comes from `a`, and
// nav is carved via `footprintW` — the navmesh blocks the cells/edges the run's rotated rectangle
// crosses, like a free wall (blocks/footprint.ts). `height`/`thickness` are first-class + canvas-
// inline; `params` carries the rest (e.g. color, innerColor for the gap reveals). The local id
// (`run`) is stable, so dragging an endpoint only re-meshes, never re-keys.
export const railingKind: NodeKind = {
  inputs: {
    a: { type: "point", default: null },
    b: { type: "point", default: null },
    height: { type: "number", default: 1, inline: true }, // shipped default 1 m; scale doc §8 suggests a 1.07 m guard — bump deliberately (visual change)
    thickness: { type: "number", default: 0.1, inline: true }, // footprint depth (≈0.10 m)
    params: { type: "json", default: null },
  },
  outputs: { placements: { type: "placements" } },
  build: (scope, { a, b, height, thickness, params }) => ({
    placements: scope.computed<Placement[]>((use) => {
      const pa = use(a) as Point | null;
      const pb = use(b) as Point | null;
      if (!pa || !pb) return [];

      const ax = pa.x; // points are world meters in world space (doc v4): x = X, z = Z (floor)
      const az = pa.z;
      const bx = pb.x;
      const bz = pb.z;
      const len = Math.hypot(bx - ax, bz - az);
      if (len < MIN_RUN_M) return []; // coincident points: no railing

      const th = use(thickness) as number;
      const rotY = aimRotY(ax, az, bx, bz);
      const p = use(params) as BlockParams | null;

      return [
        {
          id: "run", // stable single-run id — dragging a point only re-meshes, never re-keys
          block: "railing",
          pos: [(ax + bx) / 2, pa.y, (az + bz) / 2],
          rotY,
          params: {
            ...(p ?? {}),
            height: use(height) as number,
            thickness: th,
            span: len, // edgeLen = span × tile → the railing's length
            tile: 1,
            footprintW: len, // rotated-rect nav carve, like a free wall
          },
        },
      ];
    }),
  }),
};
