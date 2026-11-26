import { Object3D } from "three";

import { Axis, Transform } from "./types";

export const getTransform = (object: Object3D, transform: Transform, axis: Axis) => {
  const t = object[transform];
  return t[axis];
};

export const setTransform = (object: Object3D, transform: Transform, axis: Axis, value: number) => {
  const t = object[transform];
  t[axis] = value;
};
