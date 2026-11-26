import { BoxGeometry, Color, Mesh, MeshLambertMaterial, SRGBColorSpace } from "three";

export const Foundation = () => {
  const geometry = new BoxGeometry(1, 0.04, 1);
  const color = new Color().setHSL(0, 0, 0.5, SRGBColorSpace);
  const material = new MeshLambertMaterial({ color });
  const mesh = new Mesh(geometry, material);

  return mesh;
};
