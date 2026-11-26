import { times } from "lodash";
import { Euler, Matrix4, Object3D, Quaternion, Vector3 } from "three";

export const evenlySpaced = (inclusive = true) => (count: number) => {
  const finalCount = inclusive ? count - 1 : count;

  return times(count, n => n / finalCount);
};

export const spread = (
  objects: Object3D[],
  intervalFn: (count: number) => number[],
  ...transformFns: ((interval: number, matrix: Matrix4) => Matrix4)[]
) => {
  let matrix = new Matrix4();

  const count = objects.length;

  const results = intervalFn(count)
    .map((interval, index) => {
      const object = objects[index];

      matrix.compose(
        object.position,
        object.quaternion,
        object.scale,
      );

      for(const transformFn of transformFns)
        matrix = transformFn(interval, matrix);

      matrix.decompose(
        object.position,
        object.quaternion,
        object.scale,
      );

      return object;
    });

  return results;
};

const _position = new Vector3();
const _quaternion = new Quaternion();
const _scale = new Vector3();

export const recompose = (
  matrix: Matrix4,
  recomposeFn: (position: Vector3, quaternion: Quaternion, scale: Vector3) => void
) => {
  matrix.decompose(_position, _quaternion, _scale);
  recomposeFn(_position, _quaternion, _scale);
  matrix.compose(_position, _quaternion, _scale);

  return matrix;
};

export const circlePath = (size: number = 1, rotation: number = 0) => (x: number, matrix: Matrix4) => {
  return recompose(matrix, (position) => {
    position.add(
      new Vector3(
        Math.cos(x * Math.PI * 2 + rotation) * size,
        Math.sin(x * Math.PI * 2 + rotation) * size,
        0,
      ),
    );
  });
};

export const linearPath = (vec: Vector3) => (x: number, matrix: Matrix4) => {
  return recompose(matrix, (position) => {
    position.add(vec.clone().multiplyScalar(x));
  });
};

const _euler = new Euler();
export const rotate = (rotation: number = Math.PI * 2) => (x: number, matrix: Matrix4) => {
  return recompose(matrix, (_pos, quaternion) => {
    _euler.setFromQuaternion(quaternion);
    _euler.z += rotation * x;
    quaternion.setFromEuler(_euler);
  });
};

export const scale = (scaleBy: number | Vector3) => (x: number, matrix: Matrix4) => {
  const vec = typeof scaleBy === "number" ? new Vector3().setScalar(scaleBy) : scaleBy;

  return recompose(matrix, (_pos, _quat, scale) => {
    scale.multiply(vec);
  });
};
