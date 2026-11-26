import { Measure, NodeKind, Point, Rect, resolveMeasure } from "../types";

// Rect → Point: a DYNAMIC point pinned to a rect by two Measures — `x` resolves against the
// rect's width (world X) and `z` against its depth (world Z) (scale·L + offset), anchored at the
// NW corner. The output is a regular `point` socket, so anything that takes points (the two-point
// `wall`, seg-basis doors) can ride the rect: move or scale it and every rectPoint-derived wall
// follows. {scale: ⅓} stays a third of the way across at any size; {scale: 0, offset: 3}
// stays exactly 3 m from the north edge. The height (world Y) passes through from the rect.
export const rectPointKind: NodeKind = {
  inputs: {
    rect: { type: "rect", default: null },
    x: { type: "measure", default: { scale: 0.5, offset: 0 }, inline: true },
    z: { type: "measure", default: { scale: 0.5, offset: 0 }, inline: true },
  },
  outputs: { out: { type: "point" } },
  build: (scope, { rect, x, z }) => ({
    out: scope.computed<Point | null>((use) => {
      const r = use(rect) as Rect | null;
      if (!r) return null; // unwired → no point (consumers already guard null points)
      return {
        x: r.x + resolveMeasure(use(x) as Measure, r.w),
        y: r.y, // height passes through
        z: r.z + resolveMeasure(use(z) as Measure, r.d),
      };
    }),
  }),
};
