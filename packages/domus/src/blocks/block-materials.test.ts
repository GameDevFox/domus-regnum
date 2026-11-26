import { describe, expect, it } from "vitest";

import { wallpaperUv } from "./block-materials";

// The wallpaper tiling math is what makes the red damask flow continuously across the many 0.5 m wall
// segments (the "double check the ratio" concern). It's pure, so pin the ratios down here.
describe("wallpaperUv", () => {
  const wallH = 3.0; // one panel == 3 m wide, fits the 3 m wall height once

  it("repeats horizontally by width/wallH and once vertically for a full-height piece", () => {
    const { repeat } = wallpaperUv(1.5, wallH, 0, 0, wallH);
    expect(repeat).toEqual([0.5, 1]); // 1.5 m wide is half a panel; full height → 1
  });

  it("offsets by the piece's world-left so adjacent segments line up", () => {
    // Two abutting 1 m segments: the second starts 1 m along the run, so its offset advances by 1/3.
    const a = wallpaperUv(1, wallH, 0, 0, wallH);
    const b = wallpaperUv(1, wallH, 1, 0, wallH);
    expect(a.offset[0]).toBeCloseTo(0);
    expect(b.offset[0]).toBeCloseTo(1 / 3);
    expect(b.repeat[0]).toBeCloseTo(a.repeat[0]); // same horizontal scale → continuous pattern
  });

  it("samples only the top slice for a partial-height lintel", () => {
    // A 0.9 m-tall lintel sitting at 2.1 m up: vertical repeat shrinks, offset rises.
    const { repeat, offset } = wallpaperUv(0.9, 0.9, 0, 2.1, wallH);
    expect(repeat[1]).toBeCloseTo(0.3); // 0.9 / 3.0
    expect(offset[1]).toBeCloseTo(0.7); // 2.1 / 3.0
  });
});

// End faces get their own thin-width materials (the un-stretching fix); ±Y caps stay black; the
// two long faces are separately mapped (front/back can sit on DIFFERENT texture circuits —
// interior vs exterior, see parametric/kinds/perimeter-uv.ts). Headless the wallpaper falls back
// to flat colour mats, but the STRUCTURE is what matters here.
describe("wallBoxMats", () => {
  it("caps ±Y black and maps the four wallpapered faces independently", async () => {
    const { blackCap, wallBoxMats } = await import("./block-materials");
    const mats = wallBoxMats({}, 3, 2, 0);
    expect(mats).toHaveLength(6);
    expect(mats[2]).toBe(blackCap);
    expect(mats[3]).toBe(blackCap);
    const papered = [mats[0], mats[1], mats[4], mats[5]];
    expect(new Set(papered).size).toBe(4); // each face owns its mapping
  });
});
