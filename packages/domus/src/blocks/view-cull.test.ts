import { describe, expect, it } from "vitest";

import { cornerVisible, visibleFromSide } from "./view-cull";

// A block at the origin facing +Z (its normal points +Z). "Front" is the +Z side, "back" the -Z.
const NORMAL = { x: 0, z: 1 };
const ORIGIN = { x: 0, z: 0 };
const frontCam = { x: 0, z: 5 }; // +Z side
const backCam = { x: 0, z: -5 }; // -Z side
const onPlane = { x: 3, z: 0 }; // dot == 0

describe("visibleFromSide", () => {
  it("always renders for both / unset / unknown", () => {
    for (const cam of [frontCam, backCam, onPlane]) {
      expect(visibleFromSide("both", NORMAL, ORIGIN, cam)).toBe(true);
      expect(visibleFromSide(undefined, NORMAL, ORIGIN, cam)).toBe(true);
      expect(visibleFromSide("nonsense", NORMAL, ORIGIN, cam)).toBe(true);
    }
  });

  it("front renders only when the camera is on the +normal side", () => {
    expect(visibleFromSide("front", NORMAL, ORIGIN, frontCam)).toBe(true);
    expect(visibleFromSide("front", NORMAL, ORIGIN, backCam)).toBe(false);
    expect(visibleFromSide("front", NORMAL, ORIGIN, onPlane)).toBe(true); // dot == 0 counts as front
  });

  it("back renders only when the camera is on the -normal side", () => {
    expect(visibleFromSide("back", NORMAL, ORIGIN, backCam)).toBe(true);
    expect(visibleFromSide("back", NORMAL, ORIGIN, frontCam)).toBe(false);
    expect(visibleFromSide("back", NORMAL, ORIGIN, onPlane)).toBe(false); // dot == 0 is NOT back
  });

  it("uses the block position, not the origin, as the plane point", () => {
    const block = { x: 0, z: 10 }; // plane at z = 10
    expect(visibleFromSide("front", NORMAL, block, { x: 0, z: 12 })).toBe(true); // camera beyond block
    expect(visibleFromSide("front", NORMAL, block, { x: 0, z: 8 })).toBe(false); // camera before it
  });

  it("respects an arbitrary (e.g. rotated E/W wall) normal", () => {
    const eastNormal = { x: 1, z: 0 }; // a wall whose front faces +X
    expect(visibleFromSide("front", eastNormal, ORIGIN, { x: 4, z: 0 })).toBe(true);
    expect(visibleFromSide("front", eastNormal, ORIGIN, { x: -4, z: 0 })).toBe(false);
  });
});

describe("cornerVisible", () => {
  const at = { x: 0, z: 0 }; // post at the origin

  // The NW building corner: an N wall (cullH front, normal +Z) meets a W wall (cullV front, normal
  // +X). It should vanish only when the camera is north-AND-west of it (the diagonal, outside both).
  it("hides only in the diagonal quadrant outside both walls (front/front = NW corner)", () => {
    expect(cornerVisible("front", "front", at, { x: -5, z: -5 })).toBe(false); // NW: both hidden → gone
    expect(cornerVisible("front", "front", at, { x: 5, z: 5 })).toBe(true); // SE (interior): both shown
    expect(cornerVisible("front", "front", at, { x: 5, z: -5 })).toBe(true); // N only (E side): keep
    expect(cornerVisible("front", "front", at, { x: -5, z: 5 })).toBe(true); // W only (S side): keep
  });

  // The SE corner: an S wall (cullH back) meets an E wall (cullV back) — mirror quadrant.
  it("handles back/back (SE corner): hides only when camera is south-and-east", () => {
    expect(cornerVisible("back", "back", at, { x: 5, z: 5 })).toBe(false); // SE: both hidden → gone
    expect(cornerVisible("back", "back", at, { x: -5, z: -5 })).toBe(true); // NW (interior): shown
    expect(cornerVisible("back", "back", at, { x: 5, z: -5 })).toBe(true); // E only: keep
  });

  it("always shows when either wall is not a culling wall", () => {
    for (const cam of [
      { x: -5, z: -5 },
      { x: 5, z: 5 },
    ]) {
      expect(cornerVisible(undefined, "front", at, cam)).toBe(true);
      expect(cornerVisible("front", undefined, at, cam)).toBe(true);
      expect(cornerVisible("both", "both", at, cam)).toBe(true);
    }
  });
});
