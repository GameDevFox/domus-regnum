import { PointLight, SRGBColorSpace, Vector3 } from "three";

import { kelvinToColor } from "./color-temp";

const color = kelvinToColor(4500, SRGBColorSpace); // warm candlelight

// Defaults match the flicker baseline in domus-app/animate.ts (BASE_INTENSITY/BASE_DISTANCE).
export const addLight = (
  vec: Vector3,
  intensity: number = 10,
  distance: number = 3.5,
  decay: number = 1,
) => {
  const light = new PointLight(color, intensity, distance, decay);
  light.position.copy(vec);
  return light;
};

export const lights = () => {
  const result: PointLight[] = [];

  // Lighting
  const raisedPlatformHeight = 0.5;
  const lightHeight = 1.8 + raisedPlatformHeight;

  // - sconses
  // -- front
  result.push(addLight(
    new Vector3(-4.8, lightHeight, 2.5),
  ));
  result.push(addLight(
    new Vector3(4.8, lightHeight, 2.5),
  ));

  // -- front second floor
  const movinglight = addLight(
    new Vector3(-4.8, lightHeight + 3.5, 2.5),
  );
  movinglight.name = "MovingLight";
  result.push(movinglight);
  result.push(addLight(
    new Vector3(4.8, lightHeight + 3.5, 2.5),
  ));

  // -- second floor stairwell
  result.push(addLight(
    new Vector3(-4.8, lightHeight + 3.5, -4),
    20, 4.5,
  ));
  result.push(addLight(
    new Vector3(4.8, lightHeight + 3.5, -4),
    20, 4.5,
  ));

  // // -- back
  result.push(addLight(
    new Vector3(-3, lightHeight, -1.8),
  ));
  result.push(addLight(
    new Vector3(3, lightHeight, -1.8),
  ));

  // -- stairwell landing
  result.push(addLight(
    new Vector3(-2.5, lightHeight + 1.5, -7.8),
  ));
  result.push(addLight(
    new Vector3(2.5, lightHeight + 1.5, -7.8),
  ));

  // - chandeliers
  result.push(addLight(
    new Vector3(0, lightHeight + 3, -4),
    100, 0, 2.5,
  ));
  result.push(addLight(
    new Vector3(0, lightHeight + 3, 2),
    100, 0, 2.5,
  ));

  return result;
};
