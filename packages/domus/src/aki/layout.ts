// Aki layer geometry in the base image's NATIVE pixel space (top-left origin, y-down) — transcribed
// from rouge/aki/aki.tscn (Godot Sprite2D centers → top-left here). Commissioned art; the base pose is
// 1000×1600 and every overlay is placed within it.
//
// The seam-free trick: every layer converts pixels→world units through the SAME `PIXELS_PER_UNIT`, so a
// source pixel is the identical world size on the base and on each tiny overlay. Scaling the whole
// figure (one camera) then scales all layers by one factor — overlays stay locked to the base's pixel
// grid instead of drifting, which is what caused the border seams.

export type LayerBox = { x: number; y: number; width: number; height: number };

export const BASE_WIDTH = 1000;
export const BASE_HEIGHT = 1600;
export const PIXELS_PER_UNIT = BASE_HEIGHT; // base pose spans exactly 1 world unit tall

// glasses/ears differ from the old workout-waifu numbers — rouge has redrawn 300×300 / 400×400 art, so
// these come straight from aki.tscn, not the 5000×8000 imageTypes table.
export const LAYER_BOX = {
  base: { x: 0, y: 0, width: 1000, height: 1600 },
  eyes: { x: 420, y: 180, width: 160, height: 80 },
  mouth: { x: 482, y: 262, width: 40, height: 34 },
  glasses: { x: 348, y: 89, width: 300, height: 300 },
  catEars: { x: 290, y: -105, width: 400, height: 400 }, // ears rise above the base's top edge
  // Floating expression markers (drawn from standalone canvases, so placed by eye — refine to taste).
  // aspect preserved: angry-mark ≈ 355:371, drop ≈ 152:300.
  angryMark: { x: 600, y: 70, width: 130, height: 136 },
  drop: { x: 610, y: 175, width: 56, height: 110 },
} satisfies Record<string, LayerBox>;
