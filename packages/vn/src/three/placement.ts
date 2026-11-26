// Pure layout math for the Three.js sprite renderer — no Three.js import, so it's unit-testable in
// node. The ortho world spans x ∈ [0, aspect], y ∈ [0, 1] with y pointing UP (0 = stage floor,
// 1 = top). Working in [0, aspect] (rather than [0, 1]) keeps world units square in pixels, so a
// sprite's on-screen shape matches its texture's aspect ratio regardless of viewport shape.

import { Transform } from "../ast";

// A centered box in ortho world units: center (x, y) + size (w, h).
export type Box = { x: number; y: number; w: number; h: number };

// Place a sprite from its Transform. x/y are normalized 0..1 (y measured top→bottom, matching the
// DOM stage) and mark the sprite's BOTTOM-CENTER anchor. Default is centered, standing on the floor
// (x 0.5, y 1) — Ren'Py's default placement. `zoom` scales about that anchor; `baseHeight` is the
// height (in world y units, i.e. fraction of stage height) of a 1× sprite.
export const placeSprite = (
  t: Transform,
  aspect: number,
  texAspect: number,
  baseHeight = 0.92,
): Box => {
  const h = baseHeight * (t.zoom ?? 1);
  const w = h * texAspect;
  const cx = (t.x ?? 0.5) * aspect;
  const anchorY = 1 - (t.y ?? 1); // bottom-anchor in world (y up)
  return { x: cx, y: anchorY + h / 2, w, h };
};

// Cover box for a background: fills the [aspect × 1] view while preserving the image's aspect, with
// any overflow clipped by the camera frustum (object-fit: cover). Centered.
export const coverBackground = (aspect: number, bgAspect: number): Box => {
  let h = 1;
  let w = h * bgAspect;
  if (w < aspect) {
    w = aspect;
    h = w / bgAspect;
  }
  return { x: aspect / 2, y: 0.5, w, h };
};
