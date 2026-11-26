import { Mesh, SphereGeometry } from "three";
import type { Material, Object3D } from "three";

import { block, paintOf, post, skinOf } from "./parts";
import { texture } from "./textures";

// The small vocabulary furniture is built from. A builder works in the piece's own frame:
// standing at its middle on the floor, front towards +Z, `w` wide and `d` deep.

export type Build = (w: number, d: number, id: string) => Object3D[];

/**
 * A kind of furniture: how it is built, and whether it is tall. A tall piece goes see-through
 * when it stands between the camera and the person being followed; a low one never does, even
 * if it covers her feet. A piece that is low but carries something tall (a range and its hood)
 * is left unmarked here and marks those parts itself, with `tall` below.
 */
export type Kind = { build: Build; tall?: boolean };

/** Mark parts of an otherwise low piece as tall: the hood over a range, the posts of a bed. */
export const tall = <T extends Object3D>(...parts: T[]): T[] => {
  for (const part of parts) part.userData.tall = true;
  return parts;
};
export const isTall = (part: Object3D): boolean => part.userData.tall === true;

/** Mark a part as one that still moves, so it is not fused into the rest of its piece: the hands of a clock. */
export const moving = <T extends Object3D>(part: T): T => {
  part.userData.moving = true;
  return part;
};
export const isMoving = (part: Object3D): boolean => part.userData.moving === true;

/** A painted box, standing on y. */
export const b = (w: number, h: number, d: number, color: string, x = 0, y = 0, z = 0): Mesh => block(w, h, d, paintOf(color), x, y, z);
export const wood = (): Material => skinOf(texture("wood"));
export const oak = (): Material => skinOf(texture("oak"));
/** A box skinned in dark or pale timber. */
export const timber = (w: number, h: number, d: number, x = 0, y = 0, z = 0, pale = false): Mesh => block(w, h, d, pale ? oak() : wood(), x, y, z);
export const ball = (r: number, color: string, x: number, y: number, z: number): Mesh => {
  const mesh = new Mesh(new SphereGeometry(r, 8, 6), paintOf(color));
  mesh.position.set(x, y, z);
  return mesh;
};
export const cyl = (r: number, h: number, color: string, x = 0, y = 0, z = 0, top = r): Mesh => post(r, h, paintOf(color), x, y, z, top);

/** Four legs under a top of w by d, each `h` tall. */
export const legs = (w: number, d: number, h: number, pale = false, thick = 0.07): Mesh[] => {
  const x = w / 2 - thick;
  const z = d / 2 - thick;
  return [[-x, -z], [x, -z], [-x, z], [x, z]].map(([lx, lz]) => timber(thick, h, thick, lx, 0, lz, pale));
};

export const IRON = "#2a2a2e";
export const BRASS = "#b8923f";
export const EMBER = "#e8792e";
export const CREAM = "#ece3cf";
