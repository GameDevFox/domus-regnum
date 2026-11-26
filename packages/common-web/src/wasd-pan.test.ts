import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { panBasis } from "./wasd-pan";

const cameraLooking = (from: Vector3, at: Vector3) => {
  const cam = new PerspectiveCamera();
  cam.position.copy(from);
  cam.lookAt(at);
  cam.updateMatrixWorld();
  return cam;
};

describe("panBasis", () => {
  // A camera pitched 45° down, facing -z (the game's typical over-the-room framing).
  const pitched = () => cameraLooking(new Vector3(0, 10, 10), new Vector3(0, 0, 0));

  it("floor mode: forward is the view direction flattened onto the ground", () => {
    const { fwd, right } = panBasis(pitched(), false);
    expect(fwd.y).toBe(0);
    expect(fwd.z).toBeCloseTo(-1);
    expect(right.x).toBeCloseTo(1);
    expect(right.y).toBe(0);
  });

  it("fly mode: forward keeps the pitch — looking down + forward DESCENDS", () => {
    const { fwd, right } = panBasis(pitched(), true);
    expect(fwd.y).toBeCloseTo(-Math.SQRT1_2); // the 45° descent
    expect(fwd.z).toBeCloseTo(-Math.SQRT1_2);
    expect(fwd.length()).toBeCloseTo(1);
    // …while strafe stays horizontal (FPS-style) and unit-length despite the pitch.
    expect(right.y).toBeCloseTo(0);
    expect(right.x).toBeCloseTo(1);
    expect(right.length()).toBeCloseTo(1);
  });

  it("fly mode straight down: forward is the dive; strafe still has a usable heading", () => {
    const cam = cameraLooking(new Vector3(0, 10, 0), new Vector3(0, 0, 0));
    const { fwd, right } = panBasis(cam, true);
    expect(fwd.y).toBeCloseTo(-1);
    expect(right.y).toBeCloseTo(0);
    expect(right.length()).toBeCloseTo(1);
  });

  it("floor mode straight down falls back to a stable forward", () => {
    const cam = cameraLooking(new Vector3(0, 10, 0), new Vector3(0, 0, 0));
    const { fwd, right } = panBasis(cam, false);
    expect(fwd.y).toBe(0);
    expect(fwd.length()).toBeCloseTo(1);
    expect(right.length()).toBeCloseTo(1);
  });
});
