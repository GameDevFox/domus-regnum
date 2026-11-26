import { NodeKind, Point, Rect } from "../types";

// The first primitive: a w×d region on the floor, authored as TWO Point inputs — `position`
// (x,y,z world meters: the NW corner on the floor + height y) and `size` (x = width along world X,
// z = depth along world Z; y/height is unused for a flat rect and ignored, per the size→Point
// convention). Outputs the assembled Rect {x,y,z,w,d}, so every downstream consumer (floor, walls,
// ramp, deriveRect, …) is UNCHANGED — only the authoring shape moved to Points. A Point input edits
// as three inline fields while literal, and yields to a single point socket when wired.
export const rectKind: NodeKind = {
  inputs: {
    position: { type: "point", default: { x: 0, y: 0, z: 0 }, inline: true },
    size: { type: "point", default: { x: 0.5, y: 0, z: 0.5 }, inline: true },
  },
  outputs: { out: { type: "rect" } },
  build: (scope, { position, size }) => ({
    out: scope.computed<Rect>((use) => {
      const p = (use(position) as Point | null) ?? { x: 0, y: 0, z: 0 };
      const s = (use(size) as Point | null) ?? { x: 0.5, y: 0, z: 0.5 };
      return { x: p.x, y: p.y, z: p.z, w: s.x, d: s.z };
    }),
  }),
};
