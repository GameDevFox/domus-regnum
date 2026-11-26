import { describe, expect, it } from "vitest";

import { hsvOf, likeness, recolour, rgbOf } from "./recolour";
import type { Pixels, RGB, Swatch } from "./recolour";

// A palette swap: the part of a picture that is of one colour is given another, with its shading kept.

/** A pink dress: hues near 350 degrees. */
const PINK: Swatch = { hue: 350, width: 16, minSat: 0.3 };
const DRESS_LIT: RGB = [226, 130, 146];
const DRESS_SHADE: RGB = [150, 80, 92];
const SKIN: RGB = [243, 190, 150];
const LINEN: RGB = [244, 240, 236];
const INK: RGB = [22, 14, 16];
const picture = (...pixels: [...RGB, number][]): Pixels => ({ data: new Uint8ClampedArray(pixels.flat()), width: pixels.length, height: 1 });
const solid = (...colours: RGB[]): Pixels => picture(...colours.map((c): [...RGB, number] => [...c, 255]));
const at = (pixels: Pixels, n: number): number[] => [...pixels.data.slice(n * 4, n * 4 + 4)];
const TEAL: RGB = [40, 140, 130];

describe("telling colours apart", () => {
  it("reads a colour as hue, vividness and brightness, and back again", () => {
    for (const colour of [DRESS_LIT, SKIN, TEAL, [10, 200, 30] as RGB, [0, 0, 0] as RGB, [255, 255, 255] as RGB]) {
      const back = rgbOf(...hsvOf(...colour));
      for (const n of [0, 1, 2]) expect(back[n]).toBeCloseTo(colour[n], 6);
    }
    expect(hsvOf(255, 0, 0)[0]).toBe(0);
    expect(hsvOf(0, 255, 0)[0]).toBe(120);
    expect(hsvOf(0, 0, 255)[0]).toBe(240);
  });

  it("finds what is of the swatch, across the turn of the hues, and nothing that is not", () => {
    expect(likeness(PINK, 350, 0.5, 0.8)).toBe(1);
    // 355 and 5 are either side of red: ten degrees apart, not three hundred and fifty.
    expect(likeness(PINK, 5, 0.5, 0.8)).toBe(1);
    expect(likeness(PINK, 20, 0.5, 0.8)).toBe(0);
    expect(likeness(PINK, 120, 0.9, 0.8)).toBe(0);
  });

  it("fades at the edges, so that an edge blends: by hue, and by vividness", () => {
    const edge = likeness(PINK, 350 + 16 + 5, 0.5, 0.8);
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(1);
    const pale = likeness(PINK, 350, 0.3 - 0.04, 0.8);
    expect(pale).toBeGreaterThan(0);
    expect(pale).toBeLessThan(1);
    expect(likeness(PINK, 350, 0.1, 0.8)).toBe(0);
  });

  it("leaves the outline alone, whatever its hue", () => {
    expect(likeness(PINK, 350, 0.9, 0.03)).toBe(0);
    expect(likeness(PINK, 350, 0.9, 0.2)).toBe(1);
  });

  it("leaves alone what is darker than a swatch says its part ever is: the warm dark lines of a face, beside a bright dress", () => {
    const bright: Swatch = { ...PINK, minVal: 0.4 };
    expect(likeness(bright, 350, 0.6, 0.25)).toBe(0);
    expect(likeness(bright, 350, 0.6, 0.6)).toBe(1);
    const dusk = likeness(bright, 350, 0.6, 0.43);
    expect(dusk).toBeGreaterThan(0);
    expect(dusk).toBeLessThan(1);
  });
});

describe("a palette swap", () => {
  it("gives the dress the new colour and leaves skin, linen, ink and what is not there as they were", () => {
    const before = picture([...DRESS_LIT, 255], [...SKIN, 255], [...LINEN, 255], [...INK, 255], [200, 100, 120, 0]);
    const after = recolour(before, PINK, TEAL);
    expect(hsvOf(...(at(after, 0).slice(0, 3) as [number, number, number]))[0]).toBeCloseTo(hsvOf(...TEAL)[0], 0);
    for (const n of [1, 2, 3, 4]) expect(at(after, n)).toEqual(at(before, n));
    // The picture handed in is not written on.
    expect(at(before, 0)).toEqual([...DRESS_LIT, 255]);
  });

  it("keeps the shading: what was the darker part of the dress is the darker part still, in the same measure", () => {
    const before = solid(DRESS_LIT, DRESS_SHADE);
    const after = recolour(before, PINK, TEAL);
    const [lit, shade] = [0, 1].map((n) => hsvOf(...(at(after, n).slice(0, 3) as [number, number, number])));
    const was = [DRESS_LIT, DRESS_SHADE].map((c) => hsvOf(...c));
    expect(shade[2] / lit[2]).toBeCloseTo(was[1][2] / was[0][2], 2);
    // Between them they are the new colour: its hue exactly, and its brightness in the middle.
    expect(lit[0]).toBeCloseTo(hsvOf(...TEAL)[0], 0);
    expect(shade[0]).toBeCloseTo(hsvOf(...TEAL)[0], 0);
    expect((lit[2] + shade[2]) / 2).toBeCloseTo(hsvOf(...TEAL)[2], 1);
  });

  it("can make a dress dark, or pale, which turning the hue alone could not", () => {
    const before = solid(DRESS_LIT, DRESS_SHADE);
    const dark = recolour(before, PINK, [30, 30, 40]);
    const pale = recolour(before, PINK, [235, 235, 240]);
    expect(Math.max(...at(dark, 0).slice(0, 3))).toBeLessThan(70);
    expect(Math.min(...at(pale, 0).slice(0, 3))).toBeGreaterThan(190);
  });

  it("blends at the edge of the part: a pixel half of the dress is half recoloured", () => {
    // A hue just past the swatch's width: partly dress.
    const edgeColour = rgbOf(350 + 16 + 5, 0.5, 0.8);
    const before = solid(DRESS_LIT, edgeColour);
    const after = recolour(before, PINK, TEAL);
    const full = recolour(solid(DRESS_LIT, rgbOf(350, 0.5, 0.8)), PINK, TEAL);
    expect(at(after, 1)).not.toEqual(at(before, 1));
    expect(at(after, 1)).not.toEqual(at(full, 1));
  });

  it("does nothing to a picture with none of the colour in it", () => {
    const before = solid(SKIN, LINEN, INK);
    expect([...recolour(before, PINK, TEAL).data]).toEqual([...before.data]);
  });
});
