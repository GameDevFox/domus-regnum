import { DirectionalLight, HemisphereLight, SRGBColorSpace } from "three";
import type { Group } from "three";

import type { Scope } from "@scene-lib/scope";
import type { Value } from "@scene-lib/value";

import type { Daylight, Rgb } from "./daylight";
import { group } from "./parts";

// The sun, the light from all round, and the dark the house floats in: all three follow the
// time of day (daylight.ts).

/** How far off the sun is hung, in metres: far enough that its light falls the same way on the whole house. */
const SUN_DISTANCE = 32;
/** The page's own names for the three colours of the dark behind the house (demo3d.css). */
const BACKDROP_VARS = ["--sky-inner", "--sky-mid", "--sky-edge"];
const FULL = 255;

const css = ([r, g, b]: Rgb): string => `rgb(${Math.round(r * FULL)} ${Math.round(g * FULL)} ${Math.round(b * FULL)})`;

type SkyProps = { light: Value<Daylight> };

export const Sky = (scope: Scope, { light }: SkyProps): { mesh: Group } => {
  const around = new HemisphereLight();
  const sun = new DirectionalLight();
  const mesh = group(around, sun);
  const page = document.documentElement.style;
  /** The colours the page was last given: it is told only when one changes, since each telling repaints the whole backdrop. */
  const told: string[] = [];

  scope.effect((use) => {
    const now = use(light);
    around.color.setRGB(...now.sky, SRGBColorSpace);
    around.groundColor.setRGB(...now.ground, SRGBColorSpace);
    around.intensity = now.ambient;
    sun.color.setRGB(...now.sunColor, SRGBColorSpace);
    sun.intensity = now.sunPower;
    sun.position.set(now.sun.x * SUN_DISTANCE, now.sun.y * SUN_DISTANCE, now.sun.z * SUN_DISTANCE);
    BACKDROP_VARS.forEach((name, n) => {
      const colour = css(now.backdrop[n]);
      if (told[n] === colour) return;
      told[n] = colour;
      page.setProperty(name, colour);
    });
  });
  scope.add(() => {
    for (const name of BACKDROP_VARS) page.removeProperty(name);
  });
  return { mesh };
};
