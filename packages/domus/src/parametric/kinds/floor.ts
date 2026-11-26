import { BlockParams, Placement } from "../../blocks/types";
import { Cell } from "../../blocks/grid";
import { NodeKind, Rect } from "../types";
import { rectTooSmall } from "./constants";

// One merged region floor covering the whole rect — a 10×12 floor is one quad, not 120 tiles
// (GridPlacement.size; same data the editor's region tool emits). Local id "area" — the
// deriver prefixes the node id, so the placement key is stable across regenerations.
// The rect is METERS (corner-anchored); the grid placement converts to cells — fractional
// cell/size values are legal (the mesh sits at the fraction; nav covers cells whose centers
// the region contains, see level-nav.ts).
export const floorKind: NodeKind = {
  inputs: {
    rect: { type: "rect", default: null },
    block: { type: "string", default: "floor" },
    params: { type: "json", default: null },
  },
  outputs: { placements: { type: "placements" } },
  build: (scope, { rect, block, params }, ctx) => ({
    placements: scope.computed<Placement[]>((use) => {
      const r = use(rect) as Rect | null;
      if (rectTooSmall(r, ctx.tile)) return [];
      const p = use(params) as BlockParams | null;
      const cw = r.w / ctx.tile;
      const ch = r.d / ctx.tile;
      return [
        {
          id: "area",
          block: use(block) as string,
          cell: [r.x / ctx.tile + 0.5, r.z / ctx.tile + 0.5] as Cell,
          ...(cw > 1 || ch > 1 ? { size: [cw, ch] as [number, number] } : {}),
          ...(r.y ? { y: r.y } : {}),
          ...(p ? { params: p } : {}),
        },
      ];
    }),
  }),
};
