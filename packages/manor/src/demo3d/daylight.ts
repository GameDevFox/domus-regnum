import { DAY, DUSK, HOUR, WAKE, minuteOfDay } from "../game";

// The light of the day, as arithmetic: for any minute, where the sun stands and what colour
// everything is lit. It is a handful of moments (night, dawn, morning, noon, late afternoon,
// dusk) with an even slide between each and the next. The sun never drops low enough to leave
// the near walls black. The night is moonlight, cool and about a third as bright as noon: enough
// to see the garden by. The rooms are lit by their own lamps and fires (lamplight.ts), which is
// what makes the evening, which is played, bright enough to play.

/** A colour as red, green and blue, each from 0 to 1. */
export type Rgb = [number, number, number];

export type Daylight = {
  /** The way to the sun, or to the moon at night: a unit's length. +X is east, +Y up, +Z south. */
  sun: { x: number; y: number; z: number };
  sunColor: Rgb;
  sunPower: number;
  /** The light from all round: its colour from above, from below, and how strong it is. */
  sky: Rgb;
  ground: Rgb;
  ambient: number;
  /** The sky the house floats in: its colour at the middle, part way out, and at the edge. */
  backdrop: [Rgb, Rgb, Rgb];
  /** What the people's pictures are tinted by: they are painted, and take no light of their own accord. */
  figures: Rgb;
  /** 0 with the lamps out to 1 with them lit. */
  lamps: number;
};

const rgb = (hex: string): Rgb => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255) as Rgb;
const dark = (inner: string, mid: string, edge: string): [Rgb, Rgb, Rgb] => [rgb(inner), rgb(mid), rgb(edge)];

type Moment = Omit<Daylight, "sun"> & { at: number; sun: [number, number, number] };

/** The moon stands over the south-east, where the house is first seen from. */
const MOON: [number, number, number] = [0.35, 0.8, 0.5];
const UNLIT: Rgb = [1, 1, 1];
const WOOD_FLOOR = rgb("#5b4a3c");

const NIGHT: Omit<Moment, "at"> = { sun: MOON, sunColor: rgb("#a9bdf2"), sunPower: 0.5, sky: rgb("#a9b8e6"), ground: rgb("#2e3148"), ambient: 0.5, backdrop: dark("#1e2540", "#121730", "#06070f"), figures: rgb("#dccfc4"), lamps: 1 };
/** By day the house floats in a blue sky; at sunrise and sunset, in a golden one. */
const BLUE_SKY = dark("#a9d6f5", "#6fb0e6", "#3f7fc4");
const GOLDEN_SKY = dark("#f8cf7c", "#e59a52", "#8a4f58");
const FULL_DAY = { sunColor: rgb("#fff0d2"), sky: rgb("#fff6e6"), ground: WOOD_FLOOR, backdrop: BLUE_SKY, figures: UNLIT, lamps: 0 };

const MOMENTS: Moment[] = [
  { at: 0, ...NIGHT },
  { at: WAKE - HOUR, ...NIGHT },
  // Dawn: a low pink sun in the east, and the lamps going out.
  { at: WAKE, sun: [0.9, 0.42, 0.1], sunColor: rgb("#ffc9a0"), sunPower: 1.1, sky: rgb("#ffe6cf"), ground: WOOD_FLOOR, ambient: 1.0, backdrop: GOLDEN_SKY, figures: rgb("#f6e6dc"), lamps: 0.3 },
  { at: WAKE + 1.5 * HOUR, ...FULL_DAY, sun: [0.6, 0.6, 0.53], sunPower: 1.6, ambient: 1.22 },
  { at: 12 * HOUR, ...FULL_DAY, sun: [0.05, 0.86, 0.5], sunPower: 1.7, ambient: 1.25 },
  { at: DUSK - 1.5 * HOUR, ...FULL_DAY, sun: [-0.62, 0.56, 0.55], sunPower: 1.6, ambient: 1.22 },
  // Dusk: a low amber sun in the west, and the lamps lit.
  { at: DUSK, sun: [-0.9, 0.4, 0.2], sunColor: rgb("#ffb27a"), sunPower: 1.0, sky: rgb("#ffdcc0"), ground: WOOD_FLOOR, ambient: 0.95, backdrop: GOLDEN_SKY, figures: rgb("#f2dcc8"), lamps: 1 },
  { at: DUSK + 1.5 * HOUR, ...NIGHT },
  { at: DAY, ...NIGHT },
];

/** Below ground there is no day: a dim, warm light from all round, and a little from overhead. */
const BELOW_GROUND = { sun: MOON, sunColor: rgb("#ffe9cf"), sunPower: 0.45, sky: rgb("#ffe2bd"), ground: rgb("#4a3c36"), ambient: 0.95, figures: rgb("#ece0d2") };

/**
 * The light in the cellar at a time of day: the same at every hour, since no daylight reaches
 * it, but for the dark the house floats in, which is the sky's and goes on changing. Its lamps
 * are lit whenever anyone is `awake`, at noon as at midnight, and out while the house sleeps.
 */
export const underground = (above: Daylight, awake: boolean): Daylight => {
  const [x, y, z] = BELOW_GROUND.sun;
  const far = Math.hypot(x, y, z);
  return { ...above, ...BELOW_GROUND, sun: { x: x / far, y: y / far, z: z / far }, lamps: awake ? 1 : 0 };
};

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const mixed = <T extends number[]>(a: T, b: T, t: number): T => a.map((v, i) => mix(v, b[i], t)) as T;

export const daylightAt = (clock: number): Daylight => {
  const minute = minuteOfDay(clock);
  const next = MOMENTS.findIndex((m) => m.at > minute);
  const [a, b] = [MOMENTS[next - 1], MOMENTS[next]];
  const t = (minute - a.at) / (b.at - a.at);
  const [x, y, z] = mixed(a.sun, b.sun, t);
  const far = Math.hypot(x, y, z);
  return {
    sun: { x: x / far, y: y / far, z: z / far },
    sunColor: mixed(a.sunColor, b.sunColor, t),
    sunPower: mix(a.sunPower, b.sunPower, t),
    sky: mixed(a.sky, b.sky, t),
    ground: mixed(a.ground, b.ground, t),
    ambient: mix(a.ambient, b.ambient, t),
    backdrop: [mixed(a.backdrop[0], b.backdrop[0], t), mixed(a.backdrop[1], b.backdrop[1], t), mixed(a.backdrop[2], b.backdrop[2], t)],
    figures: mixed(a.figures, b.figures, t),
    lamps: mix(a.lamps, b.lamps, t),
  };
};
