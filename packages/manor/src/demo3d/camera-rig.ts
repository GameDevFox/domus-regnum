import { PerspectiveCamera } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { FIELD_OF_VIEW } from "./page-tuning";

// The camera the house is looked at through, and the controls that turn it about what it looks
// at: how near and how far it may go, and how steep and how shallow it may look.

/** How near the camera may come to what it looks at, and how far it may draw back, in metres. */
const NEAREST = 7;
const FARTHEST = 70;
/** How far from straight down it may look, in radians: at the steepest, and at the shallowest. */
const STEEPEST = 0.2;
const SHALLOWEST = 1.38;
/** How much of a drag's push is left to die away each frame. */
const DAMPING = 0.09;
/** What is drawn: from this near the camera to this far, in metres. */
const NEAR = 0.5;
const FAR = 300;

export type CameraRig = {
  camera: PerspectiveCamera;
  controls: OrbitControls;
  /** Set the camera so far round what it looks at (0 from the south), so far from straight down, and so far off. */
  aim: (azimuth: number, polar: number, distance: number) => void;
};

export const CameraRig = (canvas: HTMLCanvasElement): CameraRig => {
  const camera = new PerspectiveCamera(FIELD_OF_VIEW, 1, NEAR, FAR);
  const controls = new OrbitControls(camera, canvas);
  Object.assign(controls, { enableDamping: true, dampingFactor: DAMPING, minDistance: NEAREST, maxDistance: FARTHEST, minPolarAngle: STEEPEST, maxPolarAngle: SHALLOWEST, zoomToCursor: true });
  const aim = (azimuth: number, polar: number, distance: number): void => {
    const flat = Math.sin(polar) * distance;
    camera.position.set(controls.target.x + Math.sin(azimuth) * flat, controls.target.y + Math.cos(polar) * distance, controls.target.z + Math.cos(azimuth) * flat);
    controls.update();
  };
  return { camera, controls, aim };
};
