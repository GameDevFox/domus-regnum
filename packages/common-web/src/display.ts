import {
  DoubleSide, Group, Mesh, MeshBasicMaterial,
  Object3D, PlaneGeometry,
} from "three";

import { Config, TextSprite } from "./text-sprite";

const ZOOM = 2;

interface Options {
  width: number,
  aspectRatio: number,
  zoom: number,
  opacity: number,
  padding: number,
  textConfig: Partial<Config>,
};

const defaults: Options = {
  width: 1000,
  aspectRatio: 21 / 9,
  zoom: ZOOM,
  opacity: 1,
  padding: ZOOM * 0.05,
  textConfig: {},
};

export const Display = (options: Partial<Options> = {}) => {
  const {
    width, aspectRatio, zoom, opacity, padding, textConfig
  } = { ...defaults, ...options };

  const object = new Object3D();
    const display = new Group();
    display.position.set(0, -0.05, -0.1);
    display.scale.set(0.1, 0.1, 0.1);

      const { mesh: text, set } = TextSprite(width, width / aspectRatio, {
        // border: "white",
        fontSize: "31px",
        spacingScale: 1,
        ...textConfig,
      });
      text.scale.setScalar(zoom)
    display.add(text);

      const textBackground = new Mesh(
        new PlaneGeometry(),
        new MeshBasicMaterial({
          color: 0x181818,
          side: DoubleSide,
          transparent: opacity < 1,
          opacity,
        }),
      );
      textBackground.position.z = -0.01;
      textBackground.scale.x = zoom + padding;
      textBackground.scale.y = (zoom / aspectRatio) + padding;
    display.add(textBackground);
  object.add(display);

  return { object, set };
};
