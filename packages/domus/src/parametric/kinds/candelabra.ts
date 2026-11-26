import { Dir, facingRotationY } from "../../blocks/grid";
import { BlockParams, Placement } from "../../blocks/types";
import { NodeKind, Point } from "../types";
import { FACE_OPTIONS } from "./face-options";

// A wall candelabra at a point (the Game Demo's candlestick.glb; the `candelabra` block preps the
// model — back plate flush at local z=0, bbox x/y-centered). Like `place`, but with a first-class
// `height` instead of the point's elevation: the point gives the wall position (its x,y on the wall
// LINE sit the model flush against the wall) and `height` is the world Y of the model's CENTER —
// height 0 centers it on the vertical origin; the default lifts it to the lower-sconce height (the
// flat scene's sconce lights sit at 1.8 + 0.5 = 2.3 m). `face` turns it to the right wall.

export const candelabraKind: NodeKind = {
  inputs: {
    at: { type: "point", default: null },
    height: { type: "number", default: 2.3, inline: true }, // world Y of the model's center
    on: { type: "boolean", default: true, inline: true }, // light the candle (the model always shows)
    face: { type: "string", default: "", inline: true, options: FACE_OPTIONS },
    params: { type: "json", default: null },
  },
  outputs: { placements: { type: "placements" } },
  build: (scope, { at, height, on, face, params }) => ({
    placements: scope.computed<Placement[]>((use) => {
      const p = use(at) as Point | null;
      if (!p) return [];
      const f = use(face) as string;
      const pr = use(params) as BlockParams | null;
      return [
        {
          id: "item",
          block: "candelabra",
          pos: [p.x, use(height) as number, p.z], // point = wall XZ; height = the model's center Y
          rotY: f ? facingRotationY(f as Dir) : 0,
          params: { ...(pr ?? {}), on: use(on) as boolean },
        },
      ];
    }),
  }),
};
