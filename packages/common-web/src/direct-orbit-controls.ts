import { Euler, Object3D, Vector3 } from "three";
import { clamp } from "lodash";

import { r90 } from "@kitsune/common";

export const DirectOrbitControls = (object: Object3D, target: Vector3 = new Vector3()) => {
  const result = {
    target,

    radius: object.position.distanceTo(target),
    theta: 0, // Horizontal: -Math.PI to Math.PI
    phi: r90, // Vertical: 0 (top) to Math.PI (bottom)

    update: () => {
      const { radius, theta, target: localTarget } = result;
      const phi = clamp(result.phi, 0, Math.PI);

      const pos = object.position;

      pos.set(0, radius, 0);

      // Rotate around X axis
      pos.applyEuler(new Euler(phi, 0, 0));

      // Rotate around Y axis
      pos.applyEuler(new Euler(0, theta, 0));

      // Offset
      pos.add(localTarget);

      object.lookAt(localTarget);
    },
  };

  return result;
};
