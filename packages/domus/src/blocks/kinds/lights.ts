import {
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  SphereGeometry,
} from "three";

import { color, mat, num } from "../block-materials";
import { BlockParams } from "../types";

// Light block kinds — how a level declares its own lighting. Lights are blocks like anything else,
// placed freely.

// A standing lamp: a point light with a small emissive bulb and a thin stand.
export const Lamp = (_scope: unknown, params: BlockParams) => {
  const height = num(params, "height", 1.6);
  const intensity = num(params, "intensity", 8);
  const distance = num(params, "distance", 6);
  const lightColor = color(params, "color", 0xffd9a0);
  const group = new Group();

  // Stand.
  const standH = height - 0.1;
  // PS1-density segments (see furniture.ts) — the bulb is 9 cm and emissive, 6×4 reads as round.
  const standGeom = new CylinderGeometry(0.03, 0.05, standH, 6);
  standGeom.translate(0, standH / 2, 0);
  group.add(new Mesh(standGeom, mat(new Color(0x2a2a2a), 0.4, 0.6)));

  // Glowing bulb.
  const bulb = new Mesh(
    new SphereGeometry(0.09, 6, 4),
    new MeshStandardMaterial({ color: lightColor, emissive: lightColor, emissiveIntensity: 1.4 }),
  );
  bulb.position.y = height;
  group.add(bulb);

  const light = new PointLight(lightColor, intensity, distance, 1.6);
  light.position.y = height;
  light.castShadow = true;
  group.add(light);

  return { mesh: group };
};

// A warm ceiling/area light with no visible fixture — handy as a level's ambient fill.
export const Glow = (_scope: unknown, params: BlockParams) => {
  const intensity = num(params, "intensity", 5);
  const distance = num(params, "distance", 10);
  const light = new PointLight(color(params, "color", 0xffe8c0), intensity, distance, 1.4);
  const group = new Group();
  group.add(light);
  return { mesh: group };
};
