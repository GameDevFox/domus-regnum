import { Measure, NodeKind, Rect, resolveMeasure } from "../types";

// Derive a new rect FROM a source rect — every field is a Measure (scale·L + offset) resolved
// against the source's analogous dimension, so one node makes insets/quadrants, adjoining
// rooms, shrunk-or-grown regions, and elevation-stacked floors:
//
//   x      = src.x + (x.scale·src.w + x.offset)     // new left edge, fraction of src width (world X)
//   z      = src.z + (z.scale·src.d + z.offset)     // new near edge, fraction of src depth (world Z)
//   y      = src.y + (y.scale·src.y + y.offset)     // new height — y usually just an offset (a storey)
//   width  = width.scale·src.w + width.offset       // default {1,0} = same width (world X)
//   depth  = depth.scale·src.d + depth.offset       // default {1,0} = same depth (world Z)
//
// Defaults make an unconfigured node an exact COPY of the source. Examples: the left third of a
// room = x{0,0} width{1/3,0}; the room to its right = x{1,0} width{1,0}; the floor above =
// y{0, storeyHeight}. Null when the source is unwired (consumers already guard null rects).
export const deriveRectKind: NodeKind = {
  inputs: {
    // Three.js world space (doc v4): x = world X, z = world Z (floor), y = world Y (height) — all
    // offsets riding the source's analogous dimension; width = world X extent, depth = world Z.
    rect: { type: "rect", default: null },
    x: { type: "measure", default: { scale: 0, offset: 0 }, inline: true },
    y: { type: "measure", default: { scale: 0, offset: 0 }, inline: true },
    z: { type: "measure", default: { scale: 0, offset: 0 }, inline: true },
    width: { type: "measure", default: { scale: 1, offset: 0 }, inline: true },
    depth: { type: "measure", default: { scale: 1, offset: 0 }, inline: true },
  },
  outputs: { out: { type: "rect" } },
  build: (scope, { rect, x, y, z, width, depth }) => ({
    out: scope.computed<Rect | null>((use) => {
      const r = use(rect) as Rect | null;
      if (!r) return null;
      return {
        x: r.x + resolveMeasure(use(x) as Measure, r.w),
        y: r.y + resolveMeasure(use(y) as Measure, r.y), // height offset rides the source height
        z: r.z + resolveMeasure(use(z) as Measure, r.d),
        w: resolveMeasure(use(width) as Measure, r.w),
        d: resolveMeasure(use(depth) as Measure, r.d),
      };
    }),
  }),
};
