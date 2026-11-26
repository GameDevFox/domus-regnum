import { Color, ConeGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry } from "three";

import { frameDelta } from "@kitsune/common-web/src/animate";
import { Scope } from "@kitsune/common-web/src/scope";
import { Value } from "@kitsune/common-web/src/value";

import { maidSprite } from "../../maids/avatar-sprite";

// Shared bits for the live in-game sims (haul demo + Tidy House): agent colors, a random picker, and
// the little avatar mesh. These run the live ambient demo, not a deterministic recording.

// Drive a headless sim from the render loop: track wall-clock deltas off the `time` Value (clamped
// so a background tab doesn't fast-forward the world on return), tick the sim, then let `render`
// sync meshes/Values from the fresh state. The per-sim scaffold this replaces lived in
// tidy-house.ts and haul-demo.ts.
export const mountSim = (
  scope: Scope,
  time: Value<number>,
  sim: { tick: (dt: number) => void },
  render?: (dt: number) => void,
): void => {
  const delta = frameDelta(scope, time, { maxStep: 0.1 });
  scope.effect((use) => {
    const dt = use(delta);
    sim.tick(dt);
    render?.(dt);
  });
};

export const AGENT_COLORS = [0xff6e6e, 0x5ec8ff, 0x7dffb0, 0xffd166, 0xc792ea, 0xffa94d];

// Pick `n` distinct random entries (Fisher–Yates prefix). Math.random is fine here.
export const pickDistinct = <T>(items: T[], n: number): T[] => {
  const pool = [...items];
  const count = Math.min(n, pool.length);
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(Math.random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
};

// An agent avatar with two interchangeable looks under one positioned group: a 3D cone+sphere person
// and a 2D billboard maid sprite. `setBillboard` flips which is shown (sims drive it from the
// `billboards` toggle). Position the `group` each frame; the look is independent of placement.
export type Avatar = { group: Group; setBillboard: (on: boolean) => void };

export const avatar = (hex: number): Avatar => {
  const group = new Group();

  // 3D look: a colored cone body + sphere head, resting on the floor.
  const model = new Group();
  const color = new Color().setHex(hex);
  const bodyH = 0.5;
  const bodyGeom = new ConeGeometry(0.2, bodyH, 12);
  bodyGeom.translate(0, bodyH / 2, 0);
  const body = new Mesh(bodyGeom, new MeshStandardMaterial({ color, roughness: 0.6 }));
  body.castShadow = true;
  model.add(body);
  const head = new Mesh(
    new SphereGeometry(0.12, 16, 12),
    new MeshStandardMaterial({ color: new Color(color).offsetHSL(0, 0, 0.15), roughness: 0.5 }),
  );
  head.position.y = bodyH + 0.1;
  model.add(head);
  group.add(model);

  // 2D look: the maid art tinted to the agent color.
  const sprite = maidSprite(hex);
  group.add(sprite);

  const setBillboard = (on: boolean) => {
    model.visible = !on;
    sprite.visible = on;
  };
  setBillboard(true); // 2D billboards are the default look
  return { group, setBillboard };
};
