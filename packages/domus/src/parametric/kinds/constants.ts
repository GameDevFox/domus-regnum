import type { Rect } from "../types";

// Shared tolerances + defaults for the geometry kinds. Values are load-bearing (tests + nav parity
// pin behavior) — rename freely, change deliberately.

export const EPS = 1e-9; // float-noise guard for grid/tile comparisons
export const MIN_RUN_M = 1e-6; // two points closer than this are coincident — no wall/railing run
export const MIN_SEGMENT_M = 0.01; // slivers between holes narrower than this aren't worth a mesh

export const DEFAULT_WALL_THICKNESS = 0.2; // walls/wall/door/window/finish share one default

// A rect smaller than one tile in either axis emits nothing (floor/spawn/ramp/walls/door-window).
export const rectTooSmall = (r: Rect | null | undefined, tile: number): r is null | undefined =>
  !r || r.w < tile - EPS || r.d < tile - EPS;
