import { Vector3 } from "three";

import { ease } from "@kitsune/common";

export const Lerp = (v1: Vector3, v2: Vector3, easeFn = ease.linear) => {
  return (alpha: number, target?: Vector3) => {
    if(!target)
      target = new Vector3();

    const t = easeFn(alpha);

    return target.lerpVectors(v1, v2, t);
  };
};
