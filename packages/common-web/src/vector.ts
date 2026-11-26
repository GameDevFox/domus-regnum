import { Object3D, Vector3 } from "three";

import { r180 } from "@kitsune/common";

export const UP = new Vector3(0, 1, 0);

export const facingUp = (vec: Vector3) => 1 - (UP.angleTo(vec) / r180);

export const headsetFacingUp = (headsetRig: Object3D) => {
  const forward = new Vector3(0, 0, -1);
  forward.applyQuaternion(headsetRig.quaternion);

  const angle = facingUp(forward);
  return angle;
};
