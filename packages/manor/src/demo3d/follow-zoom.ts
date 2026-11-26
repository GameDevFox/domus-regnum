import type { PerspectiveCamera, Vector3 } from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type { Scope } from "@scene-lib/scope";
import type { Value } from "@scene-lib/value";

import type { View } from "./house-view";
import { ZOOM_DONE, ZOOM_EASE } from "./page-tuning";

// Following someone brings the camera in close; letting go puts it back where it was. And the
// view as a whole, taken as a shot and put back: a scene is looked at as it is staged, and the
// house afterwards as it was before (curtain.ts).

/** How the house was being looked at: into which storey, following whom, from where, and closing in or drawing back. */
export type Shot = { view: View; following: string | null; target: Vector3; position: Vector3; goal: number | null; before: number | null };

type ZoomProps = {
  camera: PerspectiveCamera;
  controls: OrbitControls;
  canvas: HTMLCanvasElement;
  following: Value<string | null>;
  view: Value<View>;
  /** How far someone followed is looked at from, at the most, in metres. */
  close: number;
  aim: (azimuth: number, polar: number, distance: number) => void;
};

export const FollowZoom = (scope: Scope, { camera, controls, canvas, following, view, close, aim }: ZoomProps) => {
  const distance = (): number => camera.position.distanceTo(controls.target);
  /** The distance the camera is easing to, when following starts or stops; null when it is left where it is. */
  let goal: number | null = null;
  /** How far away the camera was before it closed in on someone, to go back to when they are let go. */
  let before: number | null = null;
  scope.effect((use) => {
    const who = use(following);
    if (who !== null && before === null) {
      before = distance();
      goal = Math.min(before, close);
    } else if (who === null && before !== null) {
      goal = before;
      before = null;
    }
  });
  // Zooming by hand takes over from a zoom that is under way.
  scope.listen(canvas, "wheel", () => {
    goal = null;
  });
  return {
    distance,
    /** Closing in on someone followed, or drawing back after: the camera slides along its line to the target. */
    step: (dt: number): void => {
      if (goal === null) return;
      const from = distance();
      const to = Math.abs(goal - from) < ZOOM_DONE ? goal : from + (goal - from) * Math.min(1, ZOOM_EASE * dt);
      camera.position.sub(controls.target).multiplyScalar(to / from).add(controls.target);
      if (to === goal) goal = null;
    },
    take: (): Shot => ({ view: view.peek(), following: following.peek(), target: controls.target.clone(), position: camera.position.clone(), goal, before }),
    /** Put the view back as it was taken, at once. */
    put: (shot: Shot): void => {
      following.set(shot.following);
      view.set(shot.view);
      controls.target.copy(shot.target);
      camera.position.copy(shot.position);
      // (Set after whoever is followed: being followed again would otherwise start a zoom of its own.)
      goal = shot.goal;
      before = shot.before;
      controls.update();
    },
    /** Look at a point from a side and a distance, at once, with no zoom under way. */
    look: (at: { x: number; y: number; z: number }, azimuth: number, polar: number, from: number): void => {
      controls.target.set(at.x, at.y, at.z);
      aim(azimuth, polar, from);
      goal = null;
    },
  };
};

export type FollowZoom = ReturnType<typeof FollowZoom>;
