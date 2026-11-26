import { OrthographicCamera, PerspectiveCamera, Scene, WebGLRenderer } from "three";

import { Builder } from "@kitsune/common";
import { Value } from "@kitsune/common-web/src/value";

import { Console2 } from "./console2";

export type Kitsune<T> = {
  updateDep: (name: keyof T, fn: (data: any) => any) => void;
};

// An optional extra render pass, drawn over the 3D scene (after a depth clear) and under the 2D
// console overlay — the slot the VN sprite layer composites into. Holds null when nothing's drawn.
export type RenderPass = (renderer: WebGLRenderer) => void;

const MAX_DPR = 2; // retina crispness without 3×+ fill cost

export type ThreeCanvasApp = {
  animate: (time: number) => void;
  camera: PerspectiveCamera;
  canvas: HTMLCanvasElement;
  renderer: WebGLRenderer;
  scene: Scene;

  // 2d
  camera2d: OrthographicCamera;
  scene2d: Scene;
  console2d: ReturnType<typeof Console2>;

  // Optional overlay pass (e.g. the VN sprite layer). Read each frame; absent on apps without one.
  vnPass?: Value<RenderPass | null>;
};

export type SceneUserData = {
  lastTime: number;
};

const getSceneUserData = (scene: Scene) => {
  return scene.userData as SceneUserData;
};

// A handle over the render loop so callers can drive it manually instead of relying on the browser's
// requestAnimationFrame. `frame(time)` runs exactly one rendered frame at the given timestamp (ms);
// `stop`/`start` pause and resume the automatic RAF loop. This is what lets the test harness
// (domus-app/harness.ts) advance a deterministic *virtual* clock and snapshot a known frame.
export type RenderLoopHandle = {
  frame: (time: number) => void;
  stop: () => void;
  start: () => void;
};

export const setAnimationLoop = <T extends ThreeCanvasApp>({
  data,
}: {
  data: T;
}): RenderLoopHandle => {
  const { animate, camera, canvas, camera2d, console2d, renderer, scene, scene2d, vnPass } = data;

  const animationLoop = (time: number) => {
    // Size to the WRAPPER, not canvas.clientWidth: if the canvas's own CSS sizing doesn't apply,
    // its client size stays stuck at the buffer width (overflowing + clipping). Reading the parent
    // and passing updateStyle=true makes the renderer set the canvas's display size to match.
    const parent = canvas.parentElement;
    const cssWidth = parent ? parent.clientWidth : canvas.clientWidth;
    const cssHeight = parent ? parent.clientHeight : canvas.clientHeight;
    // Render at the device's physical resolution. A CSS-pixel buffer gets upscaled by the browser on
    // HiDPI displays — and in fullscreen, where the CSS size can stay the same while the physical
    // resolution jumps — which looks blurry/stretched (the console text worst of all). Cap at 2 to
    // bound the fragment cost on very dense displays.
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const bufferWidth = Math.floor(cssWidth * dpr);
    const bufferHeight = Math.floor(cssHeight * dpr);

    const needResize = canvas.width !== bufferWidth || canvas.height !== bufferHeight;
    if (needResize && bufferWidth > 0 && bufferHeight > 0) {
      // setPixelRatio first (setSize multiplies by it): the backing buffer becomes CSS size × dpr
      // while the canvas's CSS box stays the CSS size.
      renderer.setPixelRatio(dpr);
      renderer.setSize(cssWidth, cssHeight, true);

      camera.aspect = cssWidth / cssHeight;
      camera.updateProjectionMatrix();

      // The 2D overlay works in CSS pixels (so on-screen sizes are density-independent); console2
      // renders its own texture at `dpr` for crispness. Re-laying-out here keeps the text matched to
      // the frustum, or it drifts (cut off when smaller, mid-screen when larger).
      camera2d.left = -cssWidth / 2;
      camera2d.right = cssWidth / 2;
      camera2d.top = -cssHeight / 2;
      camera2d.bottom = cssHeight / 2;
      camera2d.updateProjectionMatrix();

      console2d.layout(cssWidth, cssHeight, dpr);
    }

    // Render
    const sceneUserData = getSceneUserData(scene);

    if (sceneUserData.lastTime !== time) animate(time);
    else console.warn("WARNING: `animate` was already called for this renderer");

    // We manually clear instead of setting `autoClear` to `true`
    renderer.clear();

    renderer.render(scene, camera);

    // We need to clear the depth buffer so that the depth of
    // the 3d scene doesn't cover the 2d scene and cause occlusion
    renderer.clearDepth();

    // VN sprite layer (when active): composited over the 3D world, under the 2D console. Its own
    // depth clear keeps the console pass that follows unoccluded.
    const vn = vnPass?.peek();
    if (vn) {
      vn(renderer);
      renderer.clearDepth();
    }

    renderer.render(scene2d, camera2d);

    sceneUserData.lastTime = time;
  };

  const start = () => renderer.setAnimationLoop(animationLoop);
  const stop = () => renderer.setAnimationLoop(null);
  start();
  return { frame: animationLoop, stop, start };
};

export const buildUpdateDepFn = <T extends ThreeCanvasApp>(appP: ReturnType<Builder<T>["run"]>) => {
  const updateDep: Kitsune<T>["updateDep"] = (name, fn) => {
    void appP
      .then(async (result) => {
        await result.update({ [name]: fn } as any);
        setAnimationLoop(result);
      })
      .catch((err) => console.error("[Kitsune HMR] updateDep failed:", err));
  };

  return updateDep;
};
