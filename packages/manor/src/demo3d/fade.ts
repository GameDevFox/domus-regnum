import { Box3, Mesh } from "three";
import type { Material, Object3D } from "three";

import type { Scope } from "@scene-lib/scope";

import { BODY_HEIGHTS } from "./cutaway";
import type { Eye } from "./cutaway";

// Tall things that are not walls: a staircase, a shelf, the hood over a range. A wall in front
// of the person being followed drops out of the way; one of these stays where it is and goes
// see-through instead, and comes back when she has walked on. Low things never do: a table that
// covers her feet is just a table. Low is measured from where she stands, so the step she is on
// and the few above it are low to her, and a stair stays solid under the person walking it.

/** A box square to the axes, in the world's metres. */
export type Box = { min: Eye; max: Eye };

/** How much of a see-through thing is left to see. */
export const FADED = 0.28;
/** How quickly it goes and comes back, in opacity a second. */
const FADE_SPEED = 4.5;
/** Something goes see-through when the line of sight to her passes within this of it, in metres… */
export const FADES_WITHIN = 0.15;
/** …and comes back only once the line is this far clear, so it does not dither as she walks past. */
export const CLEARS_BEYOND = 0.45;
/** Nearer solid than this, a thing is drawn as solid: no blending, and it hides what is behind it as usual. */
const SOLID = 0.999;
/** Metres above her feet: what does not come up past her waist is low, and never in the way of her. */
const LOW = BODY_HEIGHTS[1];

/** Whether the straight line from one point to another passes through a box, grown by `margin` on every side. */
export const crossesBox = (from: Eye, to: Eye, box: Box, margin: number): boolean => {
  let enter = 0;
  let leave = 1;
  for (const axis of ["x", "y", "z"] as const) {
    const low = box.min[axis] - margin;
    const high = box.max[axis] + margin;
    const run = to[axis] - from[axis];
    if (run === 0) {
      if (from[axis] < low || from[axis] > high) return false;
      continue;
    }
    const a = (low - from[axis]) / run;
    const b = (high - from[axis]) / run;
    enter = Math.max(enter, Math.min(a, b));
    leave = Math.min(leave, Math.max(a, b));
    if (enter > leave) return false;
  }
  return true;
};

/**
 * Whether something should be see-through, given whether it is now: it is when any of its boxes
 * that comes up past her waist is between the camera and her ankle, waist or head.
 */
export const fadesNext = (faded: boolean, boxes: Box[], eye: Eye, feet: Eye): boolean => {
  const margin = faded ? CLEARS_BEYOND : FADES_WITHIN;
  const high = boxes.filter((box) => box.max.y > feet.y + LOW);
  return BODY_HEIGHTS.some((h) => {
    const point = { x: feet.x, y: feet.y + h, z: feet.z };
    return high.some((box) => crossesBox(eye, point, box, margin));
  });
};

/** Something that can go see-through: what is drawn, the boxes it fills, and how solid it is now. */
export type Fader = { name: string; boxes: Box[]; skins: Material[]; faded: boolean; opacity: number };

/** The box each mesh under an object fills, in the world. Take these before the meshes are fused. */
export const boxesOf = (object: Object3D): Box[] => {
  object.updateWorldMatrix(true, true);
  const boxes: Box[] = [];
  object.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    const { min, max } = new Box3().setFromObject(o);
    boxes.push({ min: { x: min.x, y: min.y, z: min.z }, max: { x: max.x, y: max.y, z: max.z } });
  });
  return boxes;
};

/**
 * Make an object able to go see-through on its own. Paints are shared all over the house, so
 * each of its meshes is given a copy of its paint to fade. Do this once the object is fused.
 */
export const Fader = (scope: Scope, object: Object3D, boxes: Box[]): Fader => {
  const skins: Material[] = [];
  object.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    const own = (o.material as Material).clone();
    scope.own(own);
    o.material = own;
    skins.push(own);
  });
  return { name: object.name, boxes, skins, faded: false, opacity: 1 };
};

/** Move every fader on by a moment: see-through if it is in the way of the person followed, solid otherwise. */
export const stepFaders = (faders: Fader[], eye: Eye, person: Eye | null, dt: number): void => {
  for (const f of faders) {
    f.faded = person !== null && fadesNext(f.faded, f.boxes, eye, person);
    const goal = f.faded ? FADED : 1;
    if (f.opacity === goal) continue;
    f.opacity += Math.max(-FADE_SPEED * dt, Math.min(FADE_SPEED * dt, goal - f.opacity));
    const solid = f.opacity >= SOLID;
    for (const skin of f.skins) {
      // Blending is switched on only while it is needed: a solid thing is drawn with the rest of the house.
      if (skin.transparent === solid) {
        skin.transparent = !solid;
        skin.depthWrite = solid;
        skin.needsUpdate = true;
      }
      skin.opacity = f.opacity;
    }
  }
};
