import { describe, expect, it } from "vitest";

import { r90 } from "@kitsune/common";

import {
  footprintOf,
  placementFootprint,
  rectCoversPoint,
  rectCoversSegment,
  type FootRect,
} from "./footprint";

const rect = (over: Partial<FootRect> = {}): FootRect => ({
  cx: 0,
  cz: 0,
  halfW: 1,
  halfD: 0.25,
  angle: 0,
  ...over,
});

describe("footprint geometry", () => {
  it("covers points inside the axis-aligned rect, not outside", () => {
    const r = rect();
    expect(rectCoversPoint(r, 0.9, 0.2)).toBe(true);
    expect(rectCoversPoint(r, 1.1, 0)).toBe(false); // beyond halfW
    expect(rectCoversPoint(r, 0, 0.3)).toBe(false); // beyond halfD
  });

  it("rotates the extents with the rect (90° swaps width and depth)", () => {
    const r = rect({ angle: r90 }); // long axis now runs along Z
    expect(rectCoversPoint(r, 0, 0.9)).toBe(true); // 0.9 along Z is within the (now long) side
    expect(rectCoversPoint(r, 0.9, 0)).toBe(false); // 0.9 along X is beyond the (now short) side
  });

  it("detects a segment crossing the rect, and misses one that passes outside", () => {
    const r = rect();
    expect(rectCoversSegment(r, -2, 0, 2, 0)).toBe(true); // straight through
    expect(rectCoversSegment(r, -2, 1, 2, 1)).toBe(false); // passes above (z=1 > halfD)
    expect(rectCoversSegment(r, 0, 0, 5, 5)).toBe(true); // one endpoint inside
  });
});

describe("footprintOf / placementFootprint", () => {
  it("returns dimensions for obstacle furniture and null for floor/rug/lamp", () => {
    expect(footprintOf("table")).toEqual({ w: 1.1, d: 0.7 });
    expect(footprintOf("chair")).toEqual({ w: 0.42, d: 0.42 });
    expect(footprintOf("floor")).toBeNull();
    expect(footprintOf("rug")).toBeNull();
    expect(footprintOf("lamp")).toBeNull();
  });

  it("builds a world rect inflated by the buffer at the placement's transform", () => {
    const fp = placementFootprint({ block: "table", pos: [2, 0, 3] }, 1, 0.45)!;
    expect(fp.cx).toBeCloseTo(2);
    expect(fp.cz).toBeCloseTo(3);
    expect(fp.halfW).toBeCloseTo(1.1 / 2 + 0.45);
    expect(fp.halfD).toBeCloseTo(0.7 / 2 + 0.45);
  });

  it("returns null for a non-obstacle placement", () => {
    expect(placementFootprint({ block: "rug", pos: [0, 0, 0] }, 1)).toBeNull();
  });
});
