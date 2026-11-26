import {
  CULL_H,
  CULL_V,
  OUTWARD_VIEW,
  VIEW_SIDE,
  WALL_STYLE_OPTIONS,
} from "../../blocks/properties";
import { BlockParams, Placement } from "../../blocks/types";
import { Cell } from "../../blocks/grid";
import { cornerPostSize } from "../../blocks/kinds/structural";
import { Finish, NodeKind, Rect } from "../types";

import { effectiveFinish } from "./finish";
import { resolveSideHoles, splitRuns } from "./openings";
import { perimeterUv } from "./perimeter-uv";
import { DEFAULT_WALL_THICKNESS, rectTooSmall } from "./constants";

// A solid perimeter around the rect: ONE merged wall RUN per side (span = the full side), so a
// 12×10 room is 4 wall meshes instead of 44 segments — fewer draw calls, fewer reconcile keys,
// and the wallpaper tiles continuously across each side (the block factory already sizes by
// `span` and aligns textures by `runStart`). Plus a corner POST at each of the rect's four
// vertices: the runs are trimmed back (`trimStart`/`trimEnd`) to meet the post faces with a
// hair (1 mm) of overlap, so corners read as a clean pilaster instead of two walls clipping
// through each other. Posts sit at HALF-INTEGER cells — a grid placement at [x−0.5, y−0.5]
// resolves to exactly the vertex, scales with `tile`, and has no nav footprint (corners aren't
// in the footprint allowlist; the runs already block the edges). Doors are deferred — see the
// design doc; when they arrive they'll split a side's run around the opening. Local ids are the
// side (`N`…) / vertex (`NW`…), so resizing keeps all eight keys stable and only re-meshes the
// pieces that changed.
export const wallsKind: NodeKind = {
  inputs: {
    rect: { type: "rect", default: null },
    block: { type: "string", default: "wall" },
    cornerBlock: { type: "string", default: "corner" },
    // First-class (and canvas-inline) finish controls — each supersedes its key in the params
    // blob. Thickness drives runs, posts, and the run trim; texOffset slides the finish along
    // each side (seam alignment); style picks the finish ("wallpaper" | "wood").
    thickness: { type: "number", default: DEFAULT_WALL_THICKNESS, inline: true },
    texOffset: { type: "number", default: 0, inline: true },
    style: { type: "string", default: "wallpaper", inline: true, options: WALL_STYLE_OPTIONS },
    // A bound `finish` bundle supersedes the three knobs above — bind the SAME finish into this
    // perimeter and its door/window nodes and the whole room's look stays locked together.
    finish: { type: "finish", default: null },
    // Wall openings (doors/windows): Opening specs ({side, pos: Measure, size: Measure} — see
    // openings.ts), normally BOUND to `door`/`window` nodes' `opening` outputs so one value
    // drives both the gap and the fill. Accepts one spec, an array, or a literal.
    holes: { type: "opening", default: null, multi: true },
    // Camera-side culling for an EXTERIOR perimeter: each run gets its side's outward viewSide
    // (drops away when the camera looks through) and each post the cull metadata of the two
    // walls meeting it — what the hand-authored samples stamp via facingOut/addWallCorners.
    cull: { type: "boolean", default: false },
    params: { type: "json", default: null },
  },
  outputs: { placements: { type: "placements" } },
  build: (
    scope,
    {
      rect,
      block,
      cornerBlock,
      thickness: thicknessV,
      texOffset,
      style,
      finish,
      holes,
      cull,
      params,
    },
    ctx,
  ) => ({
    placements: scope.computed<Placement[]>((use) => {
      const r = use(rect) as Rect | null;
      if (rectTooSmall(r, ctx.tile)) return [];
      // The rect is METERS (corner-anchored); grid cells convert here. Fractional values are
      // legal — runs land at fractional cells (the mesh sits at the fraction; nav blocking
      // comes from the runs' footprintW carve, since fractional edge keys can't match).
      const cx = r.x / ctx.tile + 0.5; // the NW cell's grid slot (col ← world X)
      const cy = r.z / ctx.tile + 0.5; // (row ← world Z)
      const cw = r.w / ctx.tile;
      const ch = r.d / ctx.tile;
      const wallBlock = use(block) as string;
      const postBlock = use(cornerBlock) as string;
      const fin = effectiveFinish(
        use(finish) as Finish | null,
        use(thicknessV) as number,
        use(texOffset) as number,
        use(style) as string,
      );
      const thickness = fin.thickness;
      const holeSpecs = use(holes);
      const culled = use(cull) === true;
      const p: BlockParams = {
        ...((use(params) as BlockParams | null) ?? {}),
        thickness,
        texOffset: fin.texOffset,
        wallStyle: fin.wallStyle,
      };

      // Runs stop just shy of the corner posts (sized like the Corner factory sizes itself).
      const postSize = cornerPostSize(thickness);
      const trim = Math.max(postSize / 2 - 0.001, 0);
      // Texture circuits: the finish flows continuously around the room — interior and
      // exterior faces each get their circuit coordinate as the texture start, and the posts
      // wrap the vertex slice (see perimeter-uv.ts; the Wall/Corner factories consume
      // runStart/runStartBack and the per-face u params).
      const uv = perimeterUv(r, postSize);

      // Each side splits into segments around its holes (openings.ts). Segment local ids key
      // by start cell (`N-4`), so adding/removing one hole only re-meshes that side's pieces.
      // Texture anchors keep both circuits continuous straight across the gap — a door's frame
      // continues the pattern (the door kind anchors the same way).
      //
      // CORNER RULE (2026-06-12): a hole whose extent reaches a vertex removes that corner's
      // post — and any surviving run meeting that vertex EXTENDS to it (its end un-trims), so
      // disconnected segments read as deliberate free-standing walls with clean textured ends.
      // Side coordinates run in cell order: N/S west→east, W/E north→south.
      const holesBySide = {
        N: resolveSideHoles(holeSpecs, "N", r.w),
        S: resolveSideHoles(holeSpecs, "S", r.w),
        W: resolveSideHoles(holeSpecs, "W", r.d),
        E: resolveSideHoles(holeSpecs, "E", r.d),
      };
      const cornerOpen = {
        NW: holesBySide.N.touchesStart || holesBySide.W.touchesStart,
        NE: holesBySide.N.touchesEnd || holesBySide.E.touchesStart,
        SW: holesBySide.S.touchesStart || holesBySide.W.touchesEnd,
        SE: holesBySide.S.touchesEnd || holesBySide.E.touchesEnd,
      };
      // Which corner sits at each side's start/end, for the per-end trims.
      const sideCorners = {
        N: ["NW", "NE"],
        S: ["SW", "SE"],
        W: ["NW", "SW"],
        E: ["NE", "SE"],
      } as const;

      const placements: Placement[] = [];
      const side = (edge: "N" | "S" | "W" | "E", L: number) => {
        const { ranges } = holesBySide[edge];
        const [startCorner, endCorner] = sideCorners[edge];
        const startTrim = cornerOpen[startCorner] ? 0 : trim;
        const endTrim = cornerOpen[endCorner] ? 0 : trim;
        // W/E runs are MIRRORED in factory space: edgeRotationY turns local +X to world NORTH,
        // so the factory's trimStart / runStart end (local −X) is the side's cell-order END
        // (south). Swap trims and measure texture anchors from the opposite vertex there —
        // symmetric trims hid this until the corner rule made the ends differ.
        const mirrored = edge === "W" || edge === "E";
        splitRuns(L, ranges, startTrim, endTrim, ctx.tile).forEach((seg) => {
          const along = seg.startCell;
          const cell: Cell =
            edge === "N"
              ? [cx + along, cy]
              : edge === "S"
                ? [cx + along, cy + ch - 1]
                : edge === "W"
                  ? [cx, cy + along]
                  : [cx + cw - 1, cy + along];
          const fromStart = seg.startCell * ctx.tile; // cell-order start → segment
          const fromEnd = L - (seg.startCell + seg.span) * ctx.tile; // cell-order end → segment
          placements.push({
            id: `${edge}-${seg.startCell}`,
            block: wallBlock,
            cell,
            edge,
            span: seg.span,
            ...(r.y ? { y: r.y } : {}),
            params: {
              ...p,
              trimStart: mirrored ? seg.trimEnd : seg.trimStart,
              trimEnd: mirrored ? seg.trimStart : seg.trimEnd,
              runStart: uv.sides[edge].front + (mirrored ? fromEnd : fromStart),
              runStartBack: uv.sides[edge].back + (mirrored ? fromStart : fromEnd),
              // Nav: the run carves like a free wall (zero-buffer rotated rect — see
              // footprint.ts). Edge-blocking still applies at integer cells; the footprint is
              // what blocks when a smooth-scaled rect lands the run on a fractional line.
              footprintW: seg.span * ctx.tile,
              ...(culled ? { [VIEW_SIDE]: OUTWARD_VIEW[edge] } : {}),
            },
          });
        });
      };
      side("N", r.w);
      side("S", r.w);
      side("W", r.d);
      side("E", r.d);

      // Post cull metadata: the horizontal (N/S) and vertical (W/E) walls meeting each vertex.
      const post = (cell: Cell, vertex: "NW" | "NE" | "SW" | "SE"): Placement => ({
        id: vertex,
        block: postBlock,
        cell,
        ...(r.y ? { y: r.y } : {}),
        params: {
          ...p,
          ...uv.corners[vertex],
          ...(culled
            ? {
                [CULL_H]: OUTWARD_VIEW[vertex[0] as "N" | "S"],
                [CULL_V]: OUTWARD_VIEW[vertex[1] as "W" | "E"],
              }
            : {}),
        },
      });

      // Posts only where no hole touches the vertex (the corner rule above).
      const posts: Placement[] = [];
      if (!cornerOpen.NW) posts.push(post([cx - 0.5, cy - 0.5], "NW"));
      if (!cornerOpen.NE) posts.push(post([cx + cw - 0.5, cy - 0.5], "NE"));
      if (!cornerOpen.SW) posts.push(post([cx - 0.5, cy + ch - 0.5], "SW"));
      if (!cornerOpen.SE) posts.push(post([cx + cw - 0.5, cy + ch - 0.5], "SE"));
      return [...placements, ...posts];
    }),
  }),
};
