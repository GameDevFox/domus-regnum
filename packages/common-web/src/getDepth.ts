import { Object3D } from "three";

export const getDepth = (obj: Object3D) => {
  let result = 0;

  let target = obj;
  while(target.parent) {
    target = target.parent
    result++;
  }

  return result;
};
