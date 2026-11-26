import { clamp } from "lodash";
import { Color, ColorSpace, LinearSRGBColorSpace } from "three";

// 2700K = warm household bulbs
// 6500K = almost pure while

// 2700 - 3000 = warm
// 3500 - 4500 = neutral
// 5000 - 6500 = cool

const redHigh = (temp: number) => {
  return 329.698727446 * Math.pow(temp - 60, -0.1332047592);
};

const greenLow = (temp: number) => {
  return 99.4708025861 * Math.log(temp) - 161.1195681661;
};

const greenHigh = (temp: number) => {
  return 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
};

const blueMid = (temp: number) => {
  return 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
};

export const kelvinToColor = (kelvin: number, colorSpace: ColorSpace = LinearSRGBColorSpace) => {
  if(kelvin < 0)
    throw new Error("\"kelvin\" must be positive");

  const temp = kelvin / 100;

  const red = temp <= 66 ? 255 : redHigh(temp);
  const green = temp <= 66 ? greenLow(temp) : greenHigh(temp);

  let blue;
  if(temp <= 19)
    blue = 0;
  else if(temp > 19 && temp < 66) {
    blue = blueMid(temp);
  } else { // temp >= 66
    blue = 255;
  }

  const normalized = [red, green, blue].map(value => {
    const clamped = clamp(value, 0, 255);
    return clamped / 256;
  });

  return new Color().setRGB(
    normalized[0],
    normalized[1],
    normalized[2],
    colorSpace
  );
};
