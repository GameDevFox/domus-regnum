import type { MapPoint } from "../game";

// How the map is looked at: which part of it is in the frame, and how near. All of it is sums,
// kept apart from the page so that it can be tested.
//
// The rule that matters is how far out the view can draw back: no farther than takes in what
// the house has on its map, with a margin. The map will grow far beyond the first sheet; the
// player sees as much of it as has been opened, and no more.

/** A part of the map, in the map's own units (the first sheet is one unit square). */
export type Box = { x0: number; y0: number; x1: number; y1: number };

/** The frame the map is seen through, in pixels. */
export type Frame = { w: number; h: number };

/** What is being looked at: the point of the map at the middle of the frame, and how many pixels a unit of the map is drawn across. */
export type MapLook = { x: number; y: number; scale: number };

/** The paper there is to look at. */
export const SHEET: Box = { x0: 0, y0: 0, x1: 1, y1: 1 };

/** How far beyond the outermost places the view may reach, in the map's units: room for the pieces themselves, and a little country past them. */
export const REACH_MARGIN = 0.16;
/** The nearest the view comes: so many pixels to a unit of the map. Nearer than this the painting is only blur. */
export const NEAREST_SCALE = 2600;

const clamp = (n: number, low: number, high: number): number => Math.min(high, Math.max(low, n));

/** The part of the map that may be looked at: a box round every place on it, with a margin, and never past the edge of the paper. */
export const reachOf = (places: MapPoint[], sheet: Box = SHEET): Box => {
  if (places.length === 0) return sheet;
  const xs = places.map((p) => p.x);
  const ys = places.map((p) => p.y);
  return {
    x0: Math.max(sheet.x0, Math.min(...xs) - REACH_MARGIN),
    y0: Math.max(sheet.y0, Math.min(...ys) - REACH_MARGIN),
    x1: Math.min(sheet.x1, Math.max(...xs) + REACH_MARGIN),
    y1: Math.min(sheet.y1, Math.max(...ys) + REACH_MARGIN),
  };
};

/** The farthest out the view draws back: the scale at which the whole of the reach is just inside the frame. */
export const farthest = (frame: Frame, reach: Box): number => Math.min(frame.w / (reach.x1 - reach.x0), frame.h / (reach.y1 - reach.y0));

/** The nearest it comes: never less near than the farthest, on a frame so large that the two would cross. */
export const nearest = (frame: Frame, reach: Box): number => Math.max(NEAREST_SCALE, farthest(frame, reach));

/** Along one axis: keep the frame inside the reach; where the reach is the narrower of the two, centre it. */
const heldAlong = (at: number, half: number, low: number, high: number): number => (high - low <= half * 2 ? (low + high) / 2 : clamp(at, low + half, high - half));

/** A look brought within what is allowed: no farther out than the reach, no nearer than the nearest, and not slid off the reach. */
export const held = (look: MapLook, frame: Frame, reach: Box): MapLook => {
  const scale = clamp(look.scale, farthest(frame, reach), nearest(frame, reach));
  return { scale, x: heldAlong(look.x, frame.w / scale / 2, reach.x0, reach.x1), y: heldAlong(look.y, frame.h / scale / 2, reach.y0, reach.y1) };
};

/** The look the map opens with: all that may be seen, in the middle of the frame. */
export const wholeReach = (frame: Frame, reach: Box): MapLook => held({ x: (reach.x0 + reach.x1) / 2, y: (reach.y0 + reach.y1) / 2, scale: 0 }, frame, reach);

/** The point of the map under a point of the frame (in pixels from the frame's top left). */
export const mapAt = (look: MapLook, frame: Frame, at: { x: number; y: number }): MapPoint => ({ x: look.x + (at.x - frame.w / 2) / look.scale, y: look.y + (at.y - frame.h / 2) / look.scale });

/** Where in the frame a point of the map is drawn, in pixels from the frame's top left. */
export const frameAt = (look: MapLook, frame: Frame, point: MapPoint): { x: number; y: number } => ({ x: frame.w / 2 + (point.x - look.x) * look.scale, y: frame.h / 2 + (point.y - look.y) * look.scale });

/** Nearer or farther by a factor, keeping the point of the map under `at` where it is: under the pointer, or between two fingers. */
export const zoomedAt = (look: MapLook, frame: Frame, reach: Box, factor: number, at: { x: number; y: number }): MapLook => {
  const scale = clamp(look.scale * factor, farthest(frame, reach), nearest(frame, reach));
  const under = mapAt(look, frame, at);
  return held({ scale, x: under.x - (at.x - frame.w / 2) / scale, y: under.y - (at.y - frame.h / 2) / scale }, frame, reach);
};

/** Slid by so many pixels: the map goes with the hand that drags it. */
export const slidBy = (look: MapLook, frame: Frame, reach: Box, dx: number, dy: number): MapLook => held({ ...look, x: look.x - dx / look.scale, y: look.y - dy / look.scale }, frame, reach);
