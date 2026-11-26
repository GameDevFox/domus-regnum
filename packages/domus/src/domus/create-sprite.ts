import { Mesh, MeshBasicMaterial, PlaneGeometry, Sprite, SpriteMaterial, Texture } from "three";

import { yawBillboard } from "@kitsune/common-web";

export const createSprite = (texture: Texture) => {
  const material = new SpriteMaterial({
    map: texture,
  });

  const sprite = new Sprite(material);
  return sprite;
};

// Feet-at-origin unit quad shared by yaw-only billboards (translate before the caller scales, so the
// mesh's position is its feet, not its center).
const billboardGeometry = new PlaneGeometry(1, 1);
billboardGeometry.translate(0, 0.5, 0);

// A CYLINDRICAL (yaw-only) billboard — like createSprite, but it stays UPRIGHT: each frame it only
// rotates around Y to face the camera, so it never tilts back / foreshortens under the high game
// camera the way a fully camera-facing THREE.Sprite does. Same trick the maid agents use
// (src/maids/avatar-sprite.ts). Feet sit at the mesh's position; scale it like the Sprite it replaces.
export const createBillboard = (texture: Texture) => {
  const material = new MeshBasicMaterial({ map: texture, transparent: true, alphaTest: 0.5 });
  return yawBillboard(new Mesh(billboardGeometry, material));
};
