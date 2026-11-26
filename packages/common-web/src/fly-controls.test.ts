import { PerspectiveCamera } from "three";

import { FlyControls } from "./fly-controls";

// Taking over a camera must CONTINUE from its current view: the first update() (before any
// input) has to reproduce the pose exactly. Regression: initializing theta/phi via a "ZYX"
// euler decomposition returned the roll-π twin solution for yaws beyond ±90° (e.g. the Builder's
// default south-side view, yaw ≈ 180°), and zeroing that roll flipped the camera ~180° the
// moment fly mode engaged — "the camera jumps when the pointer locks".
describe("FlyControls takeover", () => {
  const poses = [
    { name: "south of target (yaw 180°) — the regression", position: [0, 10, 8] },
    { name: "north of target (yaw 0°)", position: [0, 10, -8] },
    { name: "east, low oblique", position: [12, 3, 2] },
    { name: "steep top-down-ish", position: [1, 20, 3] },
    { name: "below, looking up", position: [4, -6, -5] },
  ] as const;

  poses.forEach(({ name, position }) => {
    it(`first update leaves the pose untouched — ${name}`, () => {
      const camera = new PerspectiveCamera();
      camera.position.set(position[0], position[1], position[2]);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      const before = camera.quaternion.clone();

      // null domElement: skip DOM wiring — we only exercise the takeover math.
      const controls = FlyControls(camera, null as unknown as HTMLElement);
      controls.update(0.016); // one frame, zero input

      expect(before.angleTo(camera.quaternion)).toBeLessThan(1e-6);
    });
  });
});
