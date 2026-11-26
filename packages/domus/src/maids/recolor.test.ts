import { describe, expect, it } from "vitest";

import { greenness, hexToRgb, maskOverlay, tintUniform, type Pixels, type RGB } from "./recolor";

// Build a 1-row Pixels buffer from RGBA quads — no canvas needed (Pixels is structural).
const px = (...quads: number[][]): Pixels => ({
  data: new Uint8ClampedArray(quads.flat()),
  width: quads.length,
  height: 1,
});

const GREEN = [0, 255, 0, 255]; // the uniform key: hue 120° (=85 on PIL's scale), full sat
const RED = [255, 0, 0, 255];
const DARK = [5, 10, 5, 255]; // near-black outline (v < 20)

describe("greenness mask", () => {
  it("fully selects the saturated green uniform", () => {
    expect(greenness(85, 255, 255)).toBe(1);
  });

  it("ignores red, near-black outlines, and desaturated green", () => {
    expect(greenness(0, 255, 255)).toBe(0); // red hue, far outside the band
    expect(greenness(85, 255, 10)).toBe(0); // dark outline guard (v < 20)
    expect(greenness(85, 10, 255)).toBe(0); // saturation below the feather floor
  });

  it("feathers the hue band edges (anti-aliased pixels blend, not fringe)", () => {
    const inside = greenness(85, 255, 255);
    const nearEdge = greenness(125 + 6, 255, 255); // 6 into the 12-wide feather
    const outside = greenness(125 + 13, 255, 255);
    expect(inside).toBe(1);
    expect(nearEdge).toBeGreaterThan(0);
    expect(nearEdge).toBeLessThan(1);
    expect(outside).toBe(0);
  });
});

describe("tintUniform", () => {
  it("recolors the uniform with luminance shading and leaves everything else alone", () => {
    const src = px(GREEN, RED, DARK);
    const out = tintUniform(src, [255, 255, 255]);

    // Green: out = target * (0.35 + 0.75 * lum), lum(0,255,0) = 0.587 ⇒ ~201.
    const f = 0.35 + 0.75 * 0.587;
    expect(out.data[0]).toBeCloseTo(255 * f, 0);
    expect(out.data[1]).toBeCloseTo(255 * f, 0);
    expect(out.data[2]).toBeCloseTo(255 * f, 0);

    // Red and the dark outline are untouched.
    expect([...out.data.slice(4, 8)]).toEqual(RED);
    expect([...out.data.slice(8, 12)]).toEqual(DARK);
  });

  it("produces DARK uniforms for dark targets (the case a hue-rotate cannot do)", () => {
    const out = tintUniform(px(GREEN), [20, 16, 12]);
    expect(out.data[0]).toBeLessThan(25);
    expect(out.data[1]).toBeLessThan(20);
    expect(out.data[2]).toBeLessThan(15);
  });

  it("skips fully transparent pixels and preserves alpha", () => {
    const out = tintUniform(px([0, 255, 0, 0]), [255, 0, 0]);
    expect([...out.data]).toEqual([0, 255, 0, 0]);
  });

  it("never mutates the source buffer", () => {
    const src = px(GREEN);
    tintUniform(src, [0, 0, 0]);
    expect([...src.data]).toEqual(GREEN);
  });

  it("clamps bright targets at 255 instead of wrapping", () => {
    const bright: RGB = [255, 255, 255];
    const out = tintUniform(px(GREEN), bright);
    expect(Math.max(...out.data.slice(0, 3))).toBeLessThanOrEqual(255);
  });
});

describe("maskOverlay + hexToRgb", () => {
  it("highlights only the uniform region", () => {
    const out = maskOverlay(px(GREEN, RED), [255, 0, 200]);
    expect(out.data[0]).toBe(255); // green pixel → highlight
    expect(out.data[2]).toBe(200);
    expect([...out.data.slice(4, 8)]).toEqual(RED); // red untouched
  });

  it("hexToRgb parses with and without the leading #", () => {
    expect(hexToRgb("#ff8800")).toEqual([255, 136, 0]);
    expect(hexToRgb("0a141e")).toEqual([10, 20, 30]);
  });
});
