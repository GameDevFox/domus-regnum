import { NodeKind, Point } from "../types";

// Apply an OFFSET to a point — the sum of a base point `a`, an optional second point `b`, and a
// fixed inline (x, y, z) delta in meters. Use it for satellites that keep a FIXED distance from
// a parent point (chairs around a table): they move WITH the parent but don't scale apart from
// it (unlike a rectPoint, whose offset would grow with the room). `b` covers the literal
// point+point→sum; the inline delta is the common case (no separate delta-point node needed).
// Null when the base is unwired. The (x, y, z) delta is in Three.js world space (doc v4): x = world
// X, y = world Y (height), z = world Z (floor depth) — keys ARE the world axes.
export const offsetKind: NodeKind = {
  inputs: {
    a: { type: "point", default: null },
    b: { type: "point", default: null },
    delta: { type: "point", default: { x: 0, y: 0, z: 0 }, inline: true },
  },
  outputs: { out: { type: "point" } },
  build: (scope, { a, b, delta }) => ({
    out: scope.computed<Point | null>((use) => {
      const pa = use(a) as Point | null;
      if (!pa) return null;
      const pb = use(b) as Point | null;
      const d = (use(delta) as Point | null) ?? { x: 0, y: 0, z: 0 };
      return {
        x: pa.x + (pb?.x ?? 0) + d.x,
        y: pa.y + (pb?.y ?? 0) + d.y,
        z: pa.z + (pb?.z ?? 0) + d.z,
      };
    }),
  }),
};
