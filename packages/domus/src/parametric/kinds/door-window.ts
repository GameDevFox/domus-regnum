import { cornerPostSize } from "../../blocks/kinds/structural";
import { OUTWARD_VIEW, VIEW_SIDE, WALL_STYLE_OPTIONS } from "../../blocks/properties";
import { BlockParams, Placement } from "../../blocks/types";
import { Finish, Measure, NodeKind, Opening, Point, Rect } from "../types";

import { aimRotY } from "../seg";

import { effectiveFinish } from "./finish";
import { resolveOpening } from "./openings";
import { perimeterUv } from "./perimeter-uv";
import { DEFAULT_WALL_THICKNESS, MIN_RUN_M, rectTooSmall } from "./constants";

// The opening kinds — `door` / `window` / `hole` are one `openingKind` under three palette presets,
// differing only by the `fill` default (door/window/none). Each OWNS a wall opening — {side, pos:
// Measure, size: Measure} (pos = the hole's CENTER along the side; Measures resolve as scale·L +
// offset against the side length, unclamped) — and emits BOTH:
//
//   - `opening`: the spec itself, as an output socket. Wire it into the `walls` node's `holes`
//     input and ONE value drives the wall's gap AND the fill's size ("two separate components
//     that take the same inputs": both bind the same region; the opening flows door → walls).
//   - `placements`: the fill geometry — the existing Doorway/Window block factories, placed
//     FREE on the wall line with the exact resolved width, the wallpaper circuits flowing
//     through jambs/lintel/sill (runStart/runStartBack computed with the same perimeter-uv
//     math the wall segments use, so the pattern continues seamlessly into the frame).
//
// TWO position bases (2026-06-12): bind `rect` + `side` for a perimeter (`walls`) opening, or
// bind `a` + `b` — the SAME points as a two-point `wall` — and the Measures resolve along that run
// instead (any angle; `side` is ignored, exactly as the seg wall ignores it on its holes).
// When a/b are both wired they win.
//
// Doors are passable (the wall's hole frees the nav edges; the fill adds no footprint);
// windows carve a rotated-rect footprint so agents can't walk through the glazing. `cull`
// stamps the side's outward viewSide (region basis only — interior seg walls don't cull).

const SIDE_OPTIONS = [
  { value: "N", label: "North" },
  { value: "S", label: "South" },
  { value: "W", label: "West" },
  { value: "E", label: "East" },
];

// `fill` lets ONE opening node be a bare gap, a door, or a window — picked inline on the node.
// "none" emits just the `opening` (the consumer wall splits its run, no frame); "door"/"window" also
// place the doorway/window fill. `door`/`window`/`hole` are the SAME kind under three palette presets
// (different `fill` + width defaults), so any opening can switch what it sockets without re-wiring.
const FILL_OPTIONS = [
  { value: "none", label: "none" },
  { value: "door", label: "door" },
  { value: "window", label: "window" },
];
const BLOCK_OF: Record<string, "doorway" | "window" | null> = {
  none: null,
  door: "doorway",
  window: "window",
};

const openingKind = (defaultFill: string, defaultWidth: number): NodeKind => ({
  inputs: {
    rect: { type: "rect", default: null },
    a: { type: "point", default: null }, // seg basis: the same points the two-point wall binds
    b: { type: "point", default: null },
    side: { type: "string", default: "N", inline: true, options: SIDE_OPTIONS },
    // The opening's CENTER along the side and its width, as paired Measures (scale·L + offset)
    // — editable as scale/offset field pairs, or bound to a `measure` node to share one value.
    pos: { type: "measure", default: { scale: 0.5, offset: 0 }, inline: true },
    size: { type: "measure", default: { scale: 0, offset: defaultWidth }, inline: true },
    // What this opening sockets: none (bare gap) / door / window — the fill geometry below.
    fill: { type: "string", default: defaultFill, inline: true, options: FILL_OPTIONS },
    // Finish controls — match the wall's. Bind the SAME `finish` node into this door and its
    // walls and the frame's pattern stays locked to the wall's; the bundle supersedes these.
    thickness: { type: "number", default: DEFAULT_WALL_THICKNESS },
    texOffset: { type: "number", default: 0 },
    style: { type: "string", default: "wallpaper", options: WALL_STYLE_OPTIONS },
    finish: { type: "finish", default: null },
    cull: { type: "boolean", default: false }, // camera-side culling, with the wall's side
    // Swinging-door config (a `door` fill only; windows ignore them). `hingeRight` mounts the leaf on
    // the right jamb instead of the left; `swingOut` flips which way it opens. Together they give a
    // realistic one-way door (fixed hinge + fixed swing) — see Doorway in blocks/kinds/structural.ts.
    hingeRight: { type: "boolean", default: false, inline: true },
    swingOut: { type: "boolean", default: false, inline: true },
    params: { type: "json", default: null },
  },
  outputs: { opening: { type: "opening" }, placements: { type: "placements" } },
  build: (
    scope,
    { rect, a, b, side, pos, size, fill, thickness, texOffset, style, finish, cull, hingeRight, swingOut, params },
    ctx,
  ) => {
    const opening = scope.computed<Opening>((use) => ({
      side: use(side) as Opening["side"],
      pos: use(pos) as Measure,
      size: use(size) as Measure,
    }));
    return {
      opening,
      placements: scope.computed<Placement[]>((use) => {
        const block = BLOCK_OF[use(fill) as string];
        if (!block) return []; // fill === "none" → a bare gap (the wall still splits, no frame)
        const o = use(opening) as Opening;
        const fin = effectiveFinish(
          use(finish) as Finish | null,
          use(thickness) as number,
          use(texOffset) as number,
          use(style) as string,
        );
        const th = fin.thickness;
        const p = (use(params) as BlockParams | null) ?? {};
        const shared = {
          ...p,
          thickness: th,
          texOffset: fin.texOffset,
          wallStyle: fin.wallStyle,
          tile: 1,
          hingeRight: use(hingeRight) as boolean,
          swingOut: use(swingOut) as boolean,
        };

        // SEG BASIS: both points bound → the fill rides the a→b run (side ignored), anchored
        // exactly like the seg wall's own segments so the pattern continues across the gap.
        const pa = use(a) as Point | null;
        const pb = use(b) as Point | null;
        if (pa && pb) {
          const ax = pa.x; // points are world meters in world space (doc v4): x = X, z = Z (floor)
          const az = pa.z;
          const bx = pb.x;
          const bz = pb.z;
          const len = Math.hypot(bx - ax, bz - az);
          if (len < MIN_RUN_M) return [];
          const range = resolveOpening(o.pos, o.size, len);
          if (!range) return [];
          const [s, e] = range;
          const mid = (s + e) / 2 / len;
          return [
            {
              id: "fill",
              block,
              pos: [ax + (bx - ax) * mid, pa.y, az + (bz - az) * mid],
              rotY: aimRotY(ax, az, bx, bz),
              params: {
                ...shared,
                span: e - s,
                runStart: s,
                runStartBack: len - e,
                ...(block === "window" ? { footprintW: e - s } : {}),
              },
            },
          ];
        }

        const r = use(rect) as Rect | null;
        if (rectTooSmall(r, ctx.tile)) return [];
        const horizontal = o.side === "N" || o.side === "S";
        const L = horizontal ? r.w : r.d; // rect is world meters (doc v4): w = X, d = Z
        const range = resolveOpening(o.pos, o.size, L);
        if (!range) return []; // degenerate/outside hole → no fill (the wall stays solid too)
        const [s, e] = range;
        const width = e - s;
        const uv = perimeterUv(r, cornerPostSize(th));
        const center = (s + e) / 2;
        const x0 = r.x; // the rect's west wall line (corner-anchored meters, world X)
        const z0 = r.z; // …and its north wall line (world Z)
        const fillPos: [number, number, number] = // (`pos` is the measure input above)
          o.side === "N"
            ? [x0 + center, r.y, z0]
            : o.side === "S"
              ? [x0 + center, r.y, z0 + r.d]
              : o.side === "W"
                ? [x0, r.y, z0 + center]
                : [x0 + r.w, r.y, z0 + center];
        return [
          {
            id: "fill",
            block,
            pos: fillPos,
            rotY: horizontal ? 0 : Math.PI / 2, // same orientation as the side's wall runs
            params: {
              ...shared,
              span: width,
              // W/E fills are mirrored in factory space (rotY 90°: local −X = the side's
              // south end) — anchor from the opposite vertex there, like the wall segments.
              runStart: uv.sides[o.side].front + (horizontal ? s : L - e),
              runStartBack: uv.sides[o.side].back + (horizontal ? L - e : s),
              ...(use(cull) ? { [VIEW_SIDE]: OUTWARD_VIEW[o.side] } : {}),
              ...(block === "window" ? { footprintW: width } : {}),
            },
          },
        ];
      }),
    };
  },
});

export const doorKind = openingKind("door", 1.0);
export const windowKind = openingKind("window", 1.4);
// `hole` is the bare preset (fill "none") — the same kind, defaulting to no frame.
export const holeKind = openingKind("none", 1.0);
