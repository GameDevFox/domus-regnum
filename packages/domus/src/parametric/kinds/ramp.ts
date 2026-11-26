import { BlockParams, Placement } from "../../blocks/types";
import { Cell } from "../../blocks/grid";
import { NodeKind, Rect } from "../types";
import { rectTooSmall } from "./constants";
import { STOREY_RISE } from "../../blocks/dims";

// A ramp: a sloped floor over a rect footprint — "a rect, plus a rise." Same `rect` input a
// `floor` takes, plus `rise` (how many world metres the high edge sits above the low edge) and
// `dir` (the compass direction it CLIMBS — N/E/S/W). Emits one grid placement (block "ramp"); the
// block shears the slab and level-nav.ts paints a per-step elevation onto the footprint so agents
// walk up/down/across it in discrete units, exactly the cell nav a flat rect would give — lifted.
// Other geometry (sides, rails) is layered later via separate components.
export const rampKind: NodeKind = {
  inputs: {
    rect: { type: "rect", default: null },
    rise: { type: "number", default: STOREY_RISE, inline: true },
    dir: {
      type: "string",
      default: "N",
      inline: true,
      label: "climbs",
      options: [
        { value: "N", label: "North" },
        { value: "E", label: "East" },
        { value: "S", label: "South" },
        { value: "W", label: "West" },
      ],
    },
    block: { type: "string", default: "ramp" },
    params: { type: "json", default: null },
  },
  outputs: { placements: { type: "placements" } },
  build: (scope, { rect, rise, dir, block, params }, ctx) => ({
    placements: scope.computed<Placement[]>((use) => {
      const r = use(rect) as Rect | null;
      if (rectTooSmall(r, ctx.tile)) return [];
      const p = (use(params) as BlockParams | null) ?? {};
      const cw = r.w / ctx.tile;
      const ch = r.d / ctx.tile;
      return [
        {
          id: "area",
          block: use(block) as string,
          cell: [r.x / ctx.tile + 0.5, r.z / ctx.tile + 0.5] as Cell,
          ...(cw > 1 || ch > 1 ? { size: [cw, ch] as [number, number] } : {}),
          ...(r.y ? { y: r.y } : {}),
          params: { ...p, rise: use(rise) as number, dir: use(dir) as string },
        },
      ];
    }),
  }),
};
