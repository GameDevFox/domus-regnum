import { BlockParams, Placement } from "../../blocks/types";
import { Frame, NodeKind } from "../types";

// The `instance` kind (doc-14 slice 2): stamp a block at every input FRAME — the consumer that
// finally gives the `anchor` primitive (and future wall `slots`) a purpose. Wire one or more
// frame sources into `frames` (multi) and it emits one placement per frame, oriented to the
// frame's facing. The lamp-on-an-anchor demo from the design doc; generalizes to plates on a
// table, sconces on a wall, etc. once those emit frames.
//
// Pos comes straight from the frame (world meters). rotY recovers the yaw from `facing`
// ([cos, 0, −sin]) the same way the wall factories aim: rotY = atan2(−facingZ, facingX).

const isFrame = (v: unknown): v is Frame =>
  !!v && Array.isArray((v as Frame).pos) && Array.isArray((v as Frame).facing);

export const instanceKind: NodeKind = {
  inputs: {
    frames: { type: "frame", default: null, multi: true },
    block: { type: "string", default: "lamp", inline: true },
    params: { type: "json", default: null },
  },
  outputs: { placements: { type: "placements" } },
  build: (scope, { frames, block, params }) => ({
    placements: scope.computed<Placement[]>((use) => {
      const fr = use(frames);
      const list = (Array.isArray(fr) ? fr : [fr]).filter(isFrame);
      const blk = use(block) as string;
      const p = use(params) as BlockParams | null;
      // Index-based ids: anchor frames currently share the key "anchor", so position is the only
      // unique handle available (a future per-anchor key would let these be reorder-stable).
      return list.map((f, i) => ({
        id: `inst-${i}`,
        block: blk,
        pos: f.pos,
        rotY: Math.atan2(-f.facing[2], f.facing[0]),
        ...(p ? { params: p } : {}),
      }));
    }),
  }),
};
