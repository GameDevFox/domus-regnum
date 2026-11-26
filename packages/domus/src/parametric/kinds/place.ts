import { Dir, facingRotationY } from "../../blocks/grid";
import { BlockParams, Placement } from "../../blocks/types";
import { NodeKind, Point } from "../types";
import { FACE_OPTIONS } from "./face-options";

// Place ONE block at a point (world meters), oriented by a grid `face` (N/S/E/W; "" = no
// rotation). The point-based companion to `spawn` (rect center) and `instance` (frames): wire a
// `rectPoint` — or an `offset` of one — into `at` and the furniture rides the room as it scales
// or moves. Emits a FREE placement, so the navmesh carves its footprint exactly like the
// hand-placed original at the same spot (positions stay identical at the default room size).

export const placeKind: NodeKind = {
  inputs: {
    at: { type: "point", default: null },
    block: { type: "string", default: "table", inline: true },
    face: { type: "string", default: "", inline: true, options: FACE_OPTIONS },
    params: { type: "json", default: null },
  },
  outputs: { placements: { type: "placements" } },
  build: (scope, { at, block, face, params }) => ({
    placements: scope.computed<Placement[]>((use) => {
      const p = use(at) as Point | null;
      if (!p) return [];
      const f = use(face) as string;
      const pr = use(params) as BlockParams | null;
      return [
        {
          id: "item",
          block: use(block) as string,
          pos: [p.x, p.y, p.z],
          rotY: f ? facingRotationY(f as Dir) : 0,
          ...(pr ? { params: pr } : {}),
        },
      ];
    }),
  }),
};
