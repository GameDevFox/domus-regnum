import { AdditiveBlending, CanvasTexture, MeshLambertMaterial, PointLight, SRGBColorSpace, Sprite, SpriteMaterial } from "three";
import type { Object3D } from "three";

import { BRASS, IRON, ball, cyl } from "./furniture-kit";
import type { Build } from "./furniture-kit";
import { block, post } from "./parts";

// Lamps: an oil lamp on a table, the same on a tall stand, and a post in the garden; and the
// light each of them and each fire throws. A fire burns all day; a lamp is lit at dusk.

/** The colour of a flame behind glass: the lamps', and the lit windows'. */
export const LAMPLIGHT = "#ffc66e";
const FIRELIGHT = "#ffb066";

/** The glass round a flame: a lamp's globe, a lantern's panes. Clear enough to see the flame through. */
const LAMP_GLASS = new MeshLambertMaterial({ color: "#f3ecd8", transparent: true, opacity: 0.2, depthWrite: false });

/** A picture painted once, the first time it is wanted. */
const painted = (w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void): (() => CanvasTexture) => {
  let made: CanvasTexture | null = null;
  return () => {
    if (made) return made;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No 2D canvas to paint a flame on");
    paint(ctx);
    made = new CanvasTexture(canvas);
    made.colorSpace = SRGBColorSpace;
    return made;
  };
};

/** A flame: a teardrop, white-hot at the heart and orange at the edge. */
const flamePicture = painted(32, 48, (ctx) => {
  const heat = ctx.createRadialGradient(16, 33, 1, 16, 30, 17);
  heat.addColorStop(0, "#fff6c2");
  heat.addColorStop(0.35, "#ffcf4d");
  heat.addColorStop(0.75, "rgba(255, 135, 30, 0.95)");
  heat.addColorStop(1, "rgba(255, 90, 10, 0)");
  ctx.fillStyle = heat;
  ctx.beginPath();
  ctx.moveTo(16, 1);
  ctx.bezierCurveTo(22, 14, 29, 22, 29, 33);
  ctx.arc(16, 33, 13, 0, Math.PI);
  ctx.bezierCurveTo(3, 22, 10, 14, 16, 1);
  ctx.fill();
});

/** The glow round a flame: bright at the middle, gone by the edge. */
const haloPicture = painted(64, 64, (ctx) => {
  const glow = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  glow.addColorStop(0, "rgba(255, 220, 150, 0.95)");
  glow.addColorStop(0.35, "rgba(255, 185, 95, 0.4)");
  glow.addColorStop(1, "rgba(255, 160, 60, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 64, 64);
});

/**
 * Every flame in the house is one picture and every glow another, each always turned to the
 * camera and neither lit by anything: a flame is seen to be alight whether or not there is a
 * wall near for its light to fall on. All are lit and put out together.
 */
let flamePaint: SpriteMaterial | null = null;
let haloPaint: SpriteMaterial | null = null;
const flameSkin = (): SpriteMaterial => (flamePaint ??= new SpriteMaterial({ map: flamePicture(), transparent: true, depthWrite: false }));
const haloSkin = (): SpriteMaterial => (haloPaint ??= new SpriteMaterial({ map: haloPicture(), transparent: true, depthWrite: false, blending: AdditiveBlending }));
/** How much of the glow is added to what is behind it when the lamps are fully lit. */
const HALO_STRENGTH = 0.75;

/** Light the lamps' flames, from 0 with them out to 1 with them lit. Out, they are not drawn at all. */
export const lightLamps = (lit: number): void => {
  const [flame, halo] = [flameSkin(), haloSkin()];
  flame.visible = halo.visible = lit > 0;
  flame.opacity = lit;
  halo.opacity = lit * HALO_STRENGTH;
};

/** A flame and the glow round it, with the flame's foot at a height: `size` is how tall the flame is, in metres. */
const flame = (x: number, y: number, z: number, size: number): Object3D[] => {
  const tongue = new Sprite(flameSkin());
  tongue.scale.set(size * FLAME_WIDTH, size, 1);
  tongue.position.set(x, y + size / 2, z);
  const halo = new Sprite(haloSkin());
  halo.scale.setScalar(size * HALO_SPREAD);
  halo.position.set(x, y + size / 2, z);
  return [tongue, halo];
};
/**
 * A flame is this much as wide as it is tall, and its glow this many times as wide as the flame
 * is tall: small enough that the wall a lamp stands against does not cut a hard edge across it.
 */
const FLAME_WIDTH = 0.66;
const HALO_SPREAD = 3.2;
/** How tall the flame of an oil lamp is, and of a garden lantern, in metres. */
const LAMP_FLAME = 0.21;
const LANTERN_FLAME = 0.3;

/** How high the flame of an oil lamp is above what it stands on, and of one on a stand above the floor. */
const FLAME_HEIGHT = 0.33;
const STAND_HEIGHT = 1.15;
const POST_HEIGHT = 2.6;

/** An oil lamp: a brass foot and font, the flame in its globe, and a glass chimney. */
const GLOBE = 0.13;
const oilLamp = (y = 0): Object3D[] => [
  cyl(0.07, 0.03, BRASS, 0, y, 0, 0.05),
  cyl(0.018, 0.12, BRASS, 0, y + 0.03, 0),
  ball(0.062, BRASS, 0, y + 0.18, 0),
  cyl(0.03, 0.04, IRON, 0, y + 0.23, 0),
  block(GLOBE, GLOBE, GLOBE, LAMP_GLASS, 0, y + FLAME_HEIGHT - GLOBE / 2, 0),
  post(0.03, 0.15, LAMP_GLASS, 0, y + FLAME_HEIGHT + GLOBE / 2, 0, 0.022),
  ...flame(0, y + FLAME_HEIGHT - GLOBE / 2, 0, LAMP_FLAME),
];

export const lamp: Build = () => oilLamp();

/** The same lamp on a slender iron stand, for a corner with no table in it. */
export const lampstand: Build = () => [cyl(0.15, 0.04, IRON, 0, 0, 0, 0.1), cyl(0.022, STAND_HEIGHT - 0.04, IRON, 0, 0.04, 0), ...oilLamp(STAND_HEIGHT)];

/** A lamp post in the garden: an iron post with a lantern at its head. `ground` is the height of the lawn. */
export const lampPost = (x: number, z: number, ground: number): Object3D[] => {
  const lantern = block(0.3, 0.36, 0.3, LAMP_GLASS, x, ground + POST_HEIGHT, z);
  return [cyl(0.09, 0.3, IRON, x, ground, z, 0.06), cyl(0.06, POST_HEIGHT, IRON, x, ground, z), lantern, cyl(0.24, 0.12, IRON, x, ground + POST_HEIGHT + 0.36, z, 0.04), ...flame(x, ground + POST_HEIGHT + 0.05, z, LANTERN_FLAME)];
};

/** A light that flickers: a fire, which is always alight, or a lamp, which is lit as the day's light goes. */
export type Glow = { light: PointLight; strength: number; phase: number; lamp: boolean };

type GlowSpec = { color: string; strength: number; reach: number; fade: number; lamp: boolean };

/** A lamp's light is hung this far over its flame, so the table it stands on is not burnt white. */
const OVER_THE_FLAME = 0.4;
/** A lamp's light falls off gently, so it fills its room and does not burn a white patch on the wall beside it. */
const INDOOR_LAMP: GlowSpec = { color: LAMPLIGHT, strength: 3.4, reach: 9, fade: 1.1, lamp: true };
const GARDEN_LAMP: GlowSpec = { color: LAMPLIGHT, strength: 11, reach: 12, fade: 1.5, lamp: true };
/** A lamp on a table stands against a wall, facing the room: its light is hung this far out from the wall. */
const INTO_THE_ROOM = 0.35;
const fire = (strength: number): GlowSpec => ({ color: FIRELIGHT, strength, reach: 6, fade: 1.6, lamp: false });

/** How far apart in their flicker one light and the next are, so no two are in step. */
const OUT_OF_STEP = 2.1;

const glow = (spec: GlowSpec, x: number, y: number, z: number, nth: number): Glow => {
  const light = new PointLight(spec.color, spec.strength, spec.reach, spec.fade);
  light.position.set(x, y, z);
  return { light, strength: spec.strength, phase: nth * OUT_OF_STEP, lamp: spec.lamp };
};

/** Things with a fire in them light the room a little, and the light is never quite still. */
const FIRES: Record<string, number> = { fireplace: 7, oven: 6, furnace: 8, range: 3 };
const FIRE_HEIGHT = 0.6;
/** A fire's light is just in front of the piece, so its own body does not sit on top of the light. */
const BEFORE_THE_FIRE = 0.35;
/** The kinds of furniture that are lamps: how high the flame of each is, and how far in front of it its light is hung. */
const LAMPS: Record<string, { flame: number; out: number }> = { lamp: { flame: FLAME_HEIGHT, out: INTO_THE_ROOM }, lampstand: { flame: STAND_HEIGHT + FLAME_HEIGHT, out: 0 } };

/** The light a piece of furniture throws, if it throws any, in the piece's own frame: `depth` is how deep the piece is. */
export const glowOf = (kind: string, depth: number, nth: number): Glow | null => {
  if (FIRES[kind]) return glow(fire(FIRES[kind]), 0, FIRE_HEIGHT, depth / 2 + BEFORE_THE_FIRE, nth);
  if (LAMPS[kind]) return glow(INDOOR_LAMP, 0, LAMPS[kind].flame + OVER_THE_FLAME, LAMPS[kind].out, nth);
  return null;
};

export const postGlow = (x: number, z: number, ground: number, nth: number): Glow => glow(GARDEN_LAMP, x, ground + POST_HEIGHT + OVER_THE_FLAME, z, nth);

/**
 * Move the lights on: `t` is the seconds the house has been alive, `lit` how far the lamps are
 * lit, from 0 to 1. A fire wavers a good deal; a flame behind glass, a little. A lamp that is
 * out is not there at all, so it costs nothing to draw by day.
 */
export const stepGlows = (glows: Glow[], t: number, lit: number): void => {
  for (const g of glows) {
    const level = g.lamp ? lit : 1;
    const waver = g.lamp ? 0.94 + 0.04 * Math.sin(t * 7 + g.phase) + 0.02 * Math.sin(t * 19 + g.phase * 3) : 0.82 + 0.12 * Math.sin(t * 9 + g.phase) + 0.06 * Math.sin(t * 23 + g.phase * 3);
    g.light.visible = level > 0;
    g.light.intensity = g.strength * level * waver;
  }
};
