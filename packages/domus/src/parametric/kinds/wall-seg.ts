import { WALL_STYLE_OPTIONS } from "../../blocks/properties";
import { BlockParams, Placement } from "../../blocks/types";
import { Finish, NodeKind, Point } from "../types";

import { aimRotY } from "../seg";

import { effectiveFinish } from "./finish";
import { resolveSideHoles } from "./openings";
import { DEFAULT_WALL_THICKNESS, MIN_RUN_M, MIN_SEGMENT_M } from "./constants";

// An INDIVIDUAL wall between two point primitives, rendered point-to-point at ANY angle: one
// FREE (non-grid) wall mesh whose endpoints sit exactly on the two points. No corner posts —
// those belong to the `walls` perimeter kind, which has multiple runs to join; a single wall
// just runs end to end. Points may be fractional — nothing snaps here; the Move tool snaps its
// own drags. Elevation comes from `a`.
//
// Nav: a free wall can't block grid EDGES the way edge-anchored walls do, so the run carries an
// explicit `footprintW` — the navmesh carves the cells/edges its rotated rectangle crosses,
// exactly like furniture (blocks/footprint.ts). The mesh length rides through the factory's
// span×tile sizing as span=worldLength, tile=1. The local id (`run`) is stable, so dragging a
// point only re-meshes, never re-keys.
export const wallSegKind: NodeKind = {
  inputs: {
    a: { type: "point", default: null },
    b: { type: "point", default: null },
    block: { type: "string", default: "wall" },
    // First-class (and canvas-inline) finish controls — each supersedes its key in the params
    // blob. Thickness flows into the mesh AND the navmesh's rotated-rect carve (footprint `d`);
    // texOffset slides the finish along the run (seam alignment); style picks the finish
    // ("wallpaper" | "wood").
    thickness: { type: "number", default: DEFAULT_WALL_THICKNESS, inline: true },
    texOffset: { type: "number", default: 0, inline: true },
    style: { type: "string", default: "wallpaper", inline: true, options: WALL_STYLE_OPTIONS },
    // A bound `finish` bundle supersedes the three knobs above (one node drives many walls).
    finish: { type: "finish", default: null },
    // Wall openings, like the perimeter kind's — but a free run has no sides, so an opening's
    // `side` is IGNORED here: its Measures resolve against the a→b length. Bare `hole` nodes make
    // several disconnected segments along one pair of points.
    holes: { type: "opening", default: null, multi: true },
    params: { type: "json", default: null },
  },
  outputs: { placements: { type: "placements" } },
  build: (scope, { a, b, block, thickness, texOffset, style, finish, holes, params }) => ({
    placements: scope.computed<Placement[]>((use) => {
      const pa = use(a) as Point | null;
      const pb = use(b) as Point | null;
      if (!pa || !pb) return [];
      const wallBlock = use(block) as string;
      const fin = effectiveFinish(
        use(finish) as Finish | null,
        use(thickness) as number,
        use(texOffset) as number,
        use(style) as string,
      );
      const th = fin.thickness;
      const p = use(params) as BlockParams | null;

      const ax = pa.x; // points are world meters in world space (doc v4): x = X, z = Z (floor)
      const az = pa.z;
      const bx = pb.x;
      const bz = pb.z;
      const len = Math.hypot(bx - ax, bz - az);
      if (len < MIN_RUN_M) return []; // coincident points: no wall

      const rotY = aimRotY(ax, az, bx, bz);
      const shared = {
        ...(p ?? {}),
        thickness: th,
        texOffset: fin.texOffset,
        wallStyle: fin.wallStyle,
        tile: 1,
      };

      const { ranges } = resolveSideHoles(use(holes), null, len);
      if (ranges.length === 0)
        return [
          {
            id: "run", // stable single-run id — dragging a point only re-meshes, never re-keys
            block: wallBlock,
            pos: [(ax + bx) / 2, pa.y, (az + bz) / 2],
            rotY,
            params: { ...shared, span: len, footprintW: len },
          },
        ];

      // Holes split the run into free segments: the complement of the merged ranges, each its
      // own placement keyed by its mm start (stable while holes elsewhere change). Texture
      // anchors continue straight across the gaps, like the perimeter kind's segments.
      const segments: Placement[] = [];
      let cursor = 0;
      const emit = (gs: number, ge: number) => {
        if (ge - gs < MIN_SEGMENT_M) return;
        const mid = (gs + ge) / 2 / len;
        segments.push({
          id: `run-${Math.round(gs * 1000)}`,
          block: wallBlock,
          pos: [ax + (bx - ax) * mid, pa.y, az + (bz - az) * mid],
          rotY,
          params: {
            ...shared,
            span: ge - gs,
            footprintW: ge - gs,
            runStart: gs,
            runStartBack: len - ge,
          },
        });
      };
      ranges.forEach(([hs, he]) => {
        emit(cursor, Math.min(hs, len));
        cursor = Math.max(cursor, he);
      });
      emit(cursor, len);
      return segments;
    }),
  }),
};
