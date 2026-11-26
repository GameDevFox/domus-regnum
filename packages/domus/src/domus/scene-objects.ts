import { loadGLTF } from "@kitsune/common-web";

import { createBillboard } from "./create-sprite";
import { lights } from "./lighting";
import { mascotTexture } from "./materials";
import { Foundation } from "./objects/foundation";
import { RoomModel } from "./room";

const Mascot = () => {
  // A yaw-only billboard (upright, faces the camera horizontally) — like the maid agents — so the
  // mascot never tilts back / foreshortens under the high game camera the way a full THREE.Sprite
  // does. Feet sit at the mascot's position (the billboard geometry is feet-anchored).
  const mascot = createBillboard(mascotTexture);
  mascot.scale.setScalar(1.65); // ~ 5 ft 5 in
  return mascot;
};

export const SceneObjects = async () => ({
  lights: lights(),

  candlestick: await loadGLTF("/models/candlestick.glb"),
  foundation: Foundation(),
  mascot: Mascot(),
  roomModel: await RoomModel(),
});

if (import.meta.hot) {
  import.meta.hot.accept();
  window.Kitsune?.updateDep("sceneObjects", SceneObjects);
}
