import { BlockParams, Placement } from "../../blocks/types";
import { Cell } from "../../blocks/grid";
import { NodeKind, Rect } from "../types";
import { rectTooSmall } from "./constants";

// Places one block on the rect's center cell (NW-biased for even sizes — grid-snapped so the
// navmesh sees a clean footprint; exact world-space centering can come later as a free
// placement option). The canonical "table centered in the room" generator.
export const spawnKind: NodeKind = {
  inputs: {
    rect: { type: "rect", default: null },
    block: { type: "string", default: "table" },
    face: { type: "string", default: null },
    params: { type: "json", default: null },
  },
  outputs: { placements: { type: "placements" } },
  build: (scope, { rect, block, face, params }, ctx) => ({
    placements: scope.computed<Placement[]>((use) => {
      const r = use(rect) as Rect | null;
      if (rectTooSmall(r, ctx.tile)) return [];
      const p = use(params) as BlockParams | null;
      const f = use(face) as "N" | "S" | "W" | "E" | null;
      // Meters → cells (corner-anchored rect): col from world X, row from world Z; then the
      // NW-biased center cell as before.
      const cell: Cell = [
        r.x / ctx.tile + 0.5 + Math.floor((r.w / ctx.tile - 1) / 2),
        r.z / ctx.tile + 0.5 + Math.floor((r.d / ctx.tile - 1) / 2),
      ];
      return [
        {
          id: "spawn",
          block: use(block) as string,
          cell,
          ...(f ? { face: f } : {}),
          ...(r.y ? { y: r.y } : {}),
          ...(p ? { params: p } : {}),
        },
      ];
    }),
  }),
};
