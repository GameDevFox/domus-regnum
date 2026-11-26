import { describe, expect, it } from "vitest";

import { coverBackground, placeSprite } from "./placement";

describe("placeSprite", () => {
  it("defaults to centered, standing on the floor", () => {
    // aspect 2 (wide), a tall sprite (texAspect 0.5).
    const box = placeSprite({}, 2, 0.5);
    expect(box.h).toBeCloseTo(0.92); // baseHeight * zoom 1
    expect(box.w).toBeCloseTo(0.46); // h * texAspect
    expect(box.x).toBeCloseTo(1.0); // 0.5 * aspect — horizontally centered
    // bottom anchor at world y 0 (floor) → center is half a height up
    expect(box.y).toBeCloseTo(0.46);
  });

  it("zoom scales about the bottom anchor", () => {
    const box = placeSprite({ zoom: 2 }, 1, 1);
    expect(box.h).toBeCloseTo(1.84);
    expect(box.w).toBeCloseTo(1.84);
    expect(box.y).toBeCloseTo(0.92); // still anchored at floor 0, center at h/2
  });

  it("maps x across [0, aspect] and y top→bottom", () => {
    const box = placeSprite({ x: 0, y: 0 }, 3, 1); // far-left, anchored at the TOP
    expect(box.x).toBeCloseTo(0);
    // y 0 → anchorY 1 (top), center half a height above that
    expect(box.y).toBeCloseTo(1 + 0.92 / 2);
  });
});

describe("coverBackground", () => {
  it("covers a view narrower than the image by matching height", () => {
    const box = coverBackground(1, 1.5); // image wider than view
    expect(box.h).toBeCloseTo(1);
    expect(box.w).toBeCloseTo(1.5);
    expect(box.x).toBeCloseTo(0.5);
    expect(box.y).toBeCloseTo(0.5);
  });

  it("scales up to cover a view wider than the image", () => {
    const box = coverBackground(2, 1.5); // view wider than image → must grow past height 1
    expect(box.w).toBeCloseTo(2);
    expect(box.h).toBeCloseTo(2 / 1.5);
    expect(box.x).toBeCloseTo(1);
  });
});
