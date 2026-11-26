// Recolouring part of a picture: a palette swap. The part is found by its colour (a dress of one
// hue, among skin, hair and linen of others), and given another colour with its shading kept:
// where the dress was in shadow the new colour is in shadow, in the same measure.
//
// It is sums on a block of pixels and nothing else, so it can be tested without a screen. The
// idea is the old Color Demo's (packages/domus/src/maids/recolor.ts), which keyed on one green
// uniform; this takes any hue, and measures the picture's own shading instead of assuming it.

/** A block of pixels, four numbers to each (red, green, blue, how solid), as a canvas gives them. */
export type Pixels = { data: Uint8ClampedArray; width: number; height: number };
export type RGB = readonly [number, number, number];

/**
 * The part of a picture to recolour, told by its colour: hues within `width` degrees of `hue`,
 * at least so vivid, and (if it says) at least so bright. A bright dress wants the last: the
 * dark warm lines a face is drawn with can be of its hue, and are not of the dress.
 */
export type Swatch = { hue: number; width: number; minSat: number; minVal?: number };

/** Beyond the swatch's width, a pixel is recoloured less and less over this many degrees: so that its edge blends and does not fringe. */
const HUE_FEATHER = 10;
/** Below the least vividness, less and less over this much of it. */
const SAT_FEATHER = 0.08;
/** No brighter than this, a pixel is outline, and is left alone, unless the swatch sets its own floor. Just above the floor, it is recoloured only in part, over a little brightness. */
const INK = 0.1;
const VAL_FEATHER = 0.06;
const FULL = 255;
const TURN = 360;

/** A colour as hue (degrees), vividness and brightness (each 0 to 1). */
export const hsvOf = (r: number, g: number, b: number): [number, number, number] => {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const spread = max - min;
  if (spread === 0) return [0, 0, max / FULL];
  const sixth = max === r ? ((g - b) / spread) % 6 : max === g ? (b - r) / spread + 2 : (r - g) / spread + 4;
  return [(sixth * 60 + TURN) % TURN, spread / max, max / FULL];
};

export const rgbOf = (h: number, s: number, v: number): RGB => {
  const f = (n: number): number => {
    const k = (n + h / 60) % 6;
    return FULL * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1)));
  };
  return [f(5), f(3), f(1)];
};

/** How much of a pixel is of the swatch, from 0 (none of it) to 1 (all of it). */
export const likeness = (swatch: Swatch, h: number, s: number, v: number): number => {
  const floor = swatch.minVal ?? INK;
  if (v <= floor) return 0;
  const byVal = Math.min(1, (v - floor) / VAL_FEATHER);
  const apart = Math.abs(((h - swatch.hue + TURN * 1.5) % TURN) - TURN / 2);
  const byHue = apart <= swatch.width ? 1 : Math.max(0, 1 - (apart - swatch.width) / HUE_FEATHER);
  const bySat = s >= swatch.minSat ? 1 : Math.max(0, 1 - (swatch.minSat - s) / SAT_FEATHER);
  return byHue * bySat * byVal;
};

/**
 * The picture with the part of it that is of the swatch recoloured to `to`. Its shading is kept:
 * each pixel is as much brighter or duller, and as much more or less vivid, than the new colour
 * as it was than the part's own middle colour. Nothing else in the picture is touched.
 */
export const recolour = (src: Pixels, swatch: Swatch, to: RGB): Pixels => {
  const data = new Uint8ClampedArray(src.data);
  const count = data.length / 4;
  const weights = new Float32Array(count);
  const sats = new Float32Array(count);
  const vals = new Float32Array(count);
  // First, which pixels are of the part, and the part's own middle vividness and brightness.
  let weight = 0;
  let midSat = 0;
  let midVal = 0;
  for (let n = 0; n < count; n++) {
    const at = n * 4;
    if (data[at + 3] === 0) continue;
    const [h, s, v] = hsvOf(data[at], data[at + 1], data[at + 2]);
    const w = likeness(swatch, h, s, v);
    weights[n] = w;
    sats[n] = s;
    vals[n] = v;
    weight += w;
    midSat += w * s;
    midVal += w * v;
  }
  if (weight === 0) return { data, width: src.width, height: src.height };
  midSat /= weight;
  midVal /= weight;
  const [hue, sat, val] = hsvOf(...to);
  // Then each of them, in the new colour, shaded as it was.
  for (let n = 0; n < count; n++) {
    const w = weights[n];
    if (w === 0) continue;
    const at = n * 4;
    const [r, g, b] = rgbOf(hue, Math.min(1, sat * (sats[n] / midSat)), Math.min(1, val * (vals[n] / midVal)));
    data[at] = r * w + data[at] * (1 - w);
    data[at + 1] = g * w + data[at + 1] * (1 - w);
    data[at + 2] = b * w + data[at + 2] * (1 - w);
  }
  return { data, width: src.width, height: src.height };
};
