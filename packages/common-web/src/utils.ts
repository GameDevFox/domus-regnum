import { Object3D, Vector3 } from "three";

import { VECTOR3_HALF, VECTOR3_UP, VECTOR3_ZERO } from "./constants";

export const modelVector3 = (model: Object3D, vec: Vector3, origin: Vector3 = VECTOR3_ZERO) => {
  const diff = new Vector3().subVectors(vec, origin);
  model.position.multiplyVectors(diff, VECTOR3_HALF).add(origin);

  model.quaternion.setFromUnitVectors(
    VECTOR3_UP,
    diff.normalize()
  );

  const distance = origin.distanceTo(vec);
  const short = distance * 0.05;
  model.scale.set(short, distance, short);
};
