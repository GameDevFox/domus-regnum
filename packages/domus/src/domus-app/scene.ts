import { NearestFilter, Object3D, Scene, Vector2 } from "three";

import { r90 } from "@kitsune/common";
import { loadTexture, yawBillboard } from "@kitsune/common-web";

import { isFlame } from "../blocks/kinds/models";
import { TextureWindow } from "../domus/texture-window";
import { createSprite } from "../domus/create-sprite";

import { DomusApp } from ".";
import { flag } from "./flags";

export const buildScene = async ({ sceneObjects }: Pick<DomusApp, "sceneObjects">) => {
  const {
    candlestick: candlestickOriginal, foundation, lights, mascot, roomModel,
  } = sceneObjects;

  const scene = new Scene();

  lights.slice(0, -2).forEach((light, index) => {
    const candlestick = candlestickOriginal.scene.clone();
    candlestick.position.z = -0.1;
    // Match the block Candelabra: the GLB's Flame.* planes yaw-billboard to face the camera.
    candlestick.traverse((o: Object3D) => {
      if ((o as { isMesh?: boolean }).isMesh && isFlame(o)) yawBillboard(o);
    });
    light.add(candlestick);
    scene.add(light);

    if(index < 6)
      light.rotateY(index % 2 === 0 ? r90 : -r90);
  });

  lights.slice(-2).forEach(light => scene.add(light));

  foundation.position.set(0, -0.5, 0);
  foundation.scale.setScalar(10);
  scene.add(foundation);

  scene.add(mascot);

  scene.add(roomModel);

  // Item icons are mounted reactively by the composition's `showItems` toggle (see composition.ts).

  // Disabled experiment, kept live behind a dev flag (domusFlags.enable("textureTest") +
  // reload): a sprite showing a movable sub-window of a texture atlas.
  if (flag("textureTest")) {
    const texture = await loadTexture("/texture-test.png");
    texture.magFilter = NearestFilter;
    const sprite = createSprite(texture);
    sprite.position.set(0, 4.7, 8.9);

    const setWindow = TextureWindow(texture);
    setWindow(new Vector2(3, 3), new Vector2(10, 10));

    scene.add(sprite);
  }

  return scene;
};

if (import.meta.hot) {
  import.meta.hot.accept();
  window.Kitsune?.updateDep("scene", buildScene);
}
