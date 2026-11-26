import { Mesh, MeshStandardMaterial, PlaneGeometry } from "three";

export const Plane = (color: number = 0x808080) => {
  const geometry = new PlaneGeometry();
  const material = new MeshStandardMaterial({ color });
  return new Mesh(geometry, material);
};
