// Runtime maid recoloring. The maid art (public/textures/maid.png) wears a green uniform that acts
// as a built-in chroma key: it is the only saturated-green region, so a hue+saturation test isolates
// it. We then recolor by *multiplying* a flat target color over the region's luminance — which keeps
// the original fold shading and works for any target, including brown/black (which a hue-rotate
// cannot produce). Ported 1:1 from tmp/clean_and_tint.py so the browser output matches the offline
// reference. See packages/domus/docs/design/04-presentation-and-accessibility.md (sprite path).

// Structural pixel buffer — ImageData satisfies this, but plain objects work too (so this is
// testable without a canvas/DOM).
export type Pixels = { data: Uint8ClampedArray<ArrayBuffer>; width: number; height: number };
export type RGB = readonly [number, number, number];

// Mask tuning. Hue/sat are on PIL's 0..255 scale to match the reference thresholds.
const HUE_LO = 50;
const HUE_HI = 125;
const HUE_FEATHER = 12;
const SAT_MIN = 55;
const SAT_FEATHER = 40;
// Tint tone curve: out = target * (LIFT + GAIN * luminance).
const LIFT = 0.35;
const GAIN = 0.75;

// RGB (0..255) → HSV on PIL's 0..255 scale (V = max channel). Matches PIL's image.convert("HSV").
const rgbToHsv255 = (r: number, g: number, b: number): [number, number, number] => {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return [0, 0, max];
  const d = max - min;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return [(h / 360) * 255, (255 * d) / max, max];
};

// How strongly a pixel belongs to the green uniform, 0..1 (feathered at the band edges so anti-
// aliased pixels blend instead of fringing).
export const greenness = (h: number, s: number, v: number): number => {
  if (v < 20) return 0; // near-black outlines: leave alone
  const hw =
    h < HUE_LO
      ? Math.max(0, 1 - (HUE_LO - h) / HUE_FEATHER)
      : h > HUE_HI
        ? Math.max(0, 1 - (h - HUE_HI) / HUE_FEATHER)
        : 1;
  const sw = s >= SAT_MIN ? 1 : Math.max(0, (s - (SAT_MIN - SAT_FEATHER)) / SAT_FEATHER);
  return hw * sw;
};

const clone = (src: Pixels): Pixels => ({
  data: new Uint8ClampedArray(src.data),
  width: src.width,
  height: src.height,
});

// Recolor the uniform to `color`, preserving shading and everything that isn't the uniform.
export const tintUniform = (src: Pixels, [tr, tg, tb]: RGB): Pixels => {
  const out = clone(src);
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (a === 0) continue;
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const [h, s, v] = rgbToHsv255(r, g, b);
    const w = greenness(h, s, v);
    if (w <= 0) continue;
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const f = LIFT + GAIN * lum;
    const nr = Math.min(255, tr * f);
    const ng = Math.min(255, tg * f);
    const nb = Math.min(255, tb * f);
    d[i] = nr * w + r * (1 - w);
    d[i + 1] = ng * w + g * (1 - w);
    d[i + 2] = nb * w + b * (1 - w);
  }
  return out;
};

// Visualize the mask: blend each uniform pixel toward `highlight` by its greenness. Drives the
// "show mask" toggle in the recolor tab.
export const maskOverlay = (src: Pixels, [hr, hg, hb]: RGB = [255, 0, 200]): Pixels => {
  const out = clone(src);
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const [h, s, v] = rgbToHsv255(r, g, b);
    const w = greenness(h, s, v);
    if (w <= 0) continue;
    d[i] = hr * w + r * (1 - w);
    d[i + 1] = hg * w + g * (1 - w);
    d[i + 2] = hb * w + b * (1 - w);
  }
  return out;
};

// "#rrggbb" → [r,g,b]. Tolerant of a missing leading '#'.
export const hexToRgb = (hex: string): RGB => {
  const h = hex.replace(/^#/, "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
};

// The maid roster palette — distinct, readable at small in-world size.
export const MAID_PALETTE: { name: string; hex: string }[] = [
  { name: "Rose", hex: "#e03b3b" },
  { name: "Amber", hex: "#f2c53d" },
  { name: "Sky", hex: "#3b7de0" },
  { name: "Plum", hex: "#a05cd0" },
  { name: "Cocoa", hex: "#8a5a2b" },
  { name: "Onyx", hex: "#2d2d32" },
  { name: "Teal", hex: "#3cc4c8" },
  { name: "Fern", hex: "#6f9e3f" },
];
