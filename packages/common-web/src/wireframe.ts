import { BufferGeometry, Line, LineBasicMaterial, Vector3 } from "three";

export const Wireframe = (min: Vector3, max: Vector3) => {
  const points = BoxPoints(min, max);

  const lineGeom = new BufferGeometry().setFromPoints(points);
  const lineMat = new LineBasicMaterial({ color: 0xff0000, linewidth: 3 });
  const line = new Line(lineGeom, lineMat);

  return line;
}

export const BoxPoints = (min: Vector3, max: Vector3) => [
  min.clone(),
  new Vector3(min.x, max.y, min.z), // (1, 0)
    new Vector3(max.x, max.y, min.z), // (1, 0)
    new Vector3(min.x, max.y, min.z), // (1, 0)
  new Vector3(min.x, max.y, max.z), // (1, 1)
    new Vector3(max.x, max.y, max.z), // (1, 1)
    new Vector3(min.x, max.y, max.z), // (1, 1)
  new Vector3(min.x, min.y, max.z), // (0, 1)
    new Vector3(max.x, min.y, max.z), // (0, 1)
    new Vector3(min.x, min.y, max.z), // (0, 1)
  min.clone(),
  new Vector3(max.x, min.y, min.z), // (0, 0)
  new Vector3(max.x, max.y, min.z), // (1, 0)
  max.clone(),
  new Vector3(max.x, min.y, max.z), // (0, 1)
  new Vector3(max.x, min.y, min.z), // (0, 0)
];
