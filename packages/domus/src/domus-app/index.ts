// Side-effect import FIRST: registers DefaultLoadingManager callbacks before the scene's loaders
// (materials.ts / block textures) run, so the very first asset batch's onStart isn't missed.
import "./loading";

import {
  BoxGeometry,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  Vector3,
} from "three";

import { Builder, r45, r180 } from "@kitsune/common";
import { vecToStr } from "@kitsune/common-web";
import { Scope } from "@kitsune/common-web/src/scope";
import { Value } from "@kitsune/common-web/src/value";
import { VNEngine, type Engine, type Script } from "@kitsune/vn";

import { ServantView } from "../world/household";
import { SceneObjects } from "../domus/scene-objects";
import { Console2 } from "../three-canvas/console2";
import { buildUpdateDepFn, Kitsune, RenderPass, ThreeCanvasApp } from "../three-canvas/utils";

import { buildAnimate } from "./animate";
import { flag } from "./flags";
import { buildBlocksScene } from "./blocks-scene";
import { buildComposition } from "./composition";
import { buildRenderer, cleanUpRenderer } from "./renderer";
import { buildScene } from "./scene";
import { buildVnScene, buildVnScript } from "./vn-scene";

declare global {
  interface Window {
    Kitsune?: Kitsune<DomusApp>;
  }
}

// The game camera's tri-state: auto-orbit, user-driven orbit, or free flight (FlyControls).
export type CameraMode = "controlled" | "manual" | "fly";

export type DomusApp = ThreeCanvasApp & {
  sceneObjects: Awaited<ReturnType<typeof SceneObjects>>;

  // Reactive state, driven by the React controls and read by the composition.
  time: Value<number>;
  cameraMode: Value<CameraMode>;
  cameraZoom: Value<number>; // 0..1 (slider): 0 = far (radius 20), 1 = close (radius 4)
  showItems: Value<boolean>;
  showConsole: Value<boolean>; // the in-world console2 debug overlay (backtick toggles it)
  composition: Scope;

  // Building-block scene: an authored room + the live haul sim running inside it (see blocks-scene).
  showBlocks: Value<boolean>;
  runHaul: Value<boolean>;
  runTidy: Value<boolean>;
  cleanliness: Value<number>; // 0..1 house-cleanliness meter, published by the Tidy House sim
  staff: Value<ServantView[]>; // live servant roster, published by the Tidy House sim
  billboards: Value<boolean>; // agent look: 2D maid sprites (default) vs 3D cone+sphere models
  blocksScene: Scope;

  // VN cutscene: the @kitsune/vn engine + its Three.js sprite layer, composited over the live house.
  vnActive: Value<boolean>; // toggles the cutscene on/off
  vnPass: Value<RenderPass | null>; // the sprite render pass the loop draws while active
  vnScript: Script; // the compiled cutscene; its exec hooks capture game Values (e.g. showItems)
  vnEngine: Engine; // the script runtime (persistent; React reads its snapshots for the dialogue box)
  vnScene: Scope;
};

export const builder = Builder()
  .add("canvas", () => {
    // Sized up front so camera/renderer/sceneObjects build at the right aspect without a
    // rebuild. <ThreeView> attaches this canvas; the render loop self-resizes from its CSS.
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    // display:block + fill the wrapper so the buffer-sized canvas doesn't overflow/clip before the
    // render loop runs (the loop then sizes it to the wrapper each frame — see setAnimationLoop).
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    return canvas;
  })
  .add(
    "camera",
    ({ canvas }) => {
      const aspect = canvas.width / canvas.height;
      const camera = new PerspectiveCamera(50, aspect, 0.1, 1000);
      camera.position.set(0, 5, 10);
      camera.rotateX(r180 * -0.2);
      return camera;
    },
    ["canvas"],
  )
  .add(
    "camera2d",
    ({ canvas }) => {
      const camera = new OrthographicCamera(
        -canvas.width / 2,
        canvas.width / 2,
        -canvas.height / 2,
        canvas.height / 2,
        1,
        1000,
      );
      camera.position.set(0, 0, 500);
      return camera;
    },
    ["canvas"],
  )
  .add("renderer", buildRenderer, ["canvas"], cleanUpRenderer)
  .add("console2d", ({ canvas }) => Console2(canvas), ["canvas"])
  .add("sceneObjects", SceneObjects)
  .add("scene", buildScene, ["sceneObjects"])
  .add(
    "scene2d",
    ({ console2d }) => {
      const scene = new Scene();
      scene.add(console2d.mesh);

      // Disabled experiment, kept live behind a dev flag (domusFlags.enable("scene2dDemo") +
      // reload): a rotating test cube on the 2D overlay with a live rotation readout.
      if (flag("scene2dDemo")) {
        const geom = new BoxGeometry(100, 100, 100);
        const mat = new MeshBasicMaterial();
        const mesh = new Mesh(geom, mat);

        mesh.rotateX(r45);
        mesh.rotateY(r45);

        setInterval(() => {
          mesh.rotateY(r45 / 60);
          console2d.set(
            "Rotation:",
            vecToStr(new Vector3(mesh.rotation.x, mesh.rotation.y, mesh.rotation.z), 2),
          );
        }, 1000 / 60);

        scene.add(mesh);
      }

      return scene;
    },
    ["console2d"],
  )
  // Reactive state: React controls flip these Values; the composition's `when` blocks react.
  .add("time", () => Value(0))
  .add("cameraMode", () => Value<CameraMode>("controlled"))
  .add("cameraZoom", () => Value(0.5)) // 0.5 → radius 12 ≈ the original framing
  .add("showItems", () => Value(false))
  .add("showConsole", () => Value(false)) // console2 debug overlay hidden until ` toggles it
  .add("showBlocks", () => Value(false))
  .add("runHaul", () => Value(false))
  .add("runTidy", () => Value(false))
  .add("cleanliness", () => Value(1))
  .add("staff", () => Value<ServantView[]>([]))
  .add("billboards", () => Value(true)) // 2D sprites (maids + item icons) by default; M toggles to 3D
  // Reactive scene composition (camera modes + item icons) — see composition.ts.
  .add(
    "composition",
    buildComposition,
    [
      "scene",
      "camera",
      "renderer",
      "sceneObjects",
      "time",
      "cameraMode",
      "cameraZoom",
      "showItems",
      "showBlocks",
      "showConsole",
      "console2d",
    ],
    // Tear the old composition down on HMR rebuild — without this every rebuild STACKS another
    // live instance (duplicate controls/effects/listeners). See docs/hmr.md.
    (scope) => scope.cleanup(),
  )
  // Authored building-block room + live haul sim, mounted into the same scene — see blocks-scene.ts.
  .add(
    "blocksScene",
    buildBlocksScene,
    [
      "scene",
      "camera",
      "sceneObjects",
      "time",
      "showBlocks",
      "runHaul",
      "runTidy",
      "cleanliness",
      "staff",
      "billboards",
    ],
    (scope) => scope.cleanup(), // see composition note / docs/hmr.md
  )
  .add("animate", buildAnimate, ["time", "console2d", "sceneObjects"])
  // VN cutscene state + engine + sprite layer (see vn-scene.ts). The script is built with the game
  // Values its choices touch (here `showItems`), so a menu choice can run game side effects. The
  // engine reads `time` for its showTime/fade clock; the sprite pass is published into `vnPass`.
  .add("vnActive", () => Value(false))
  .add("vnPass", () => Value<RenderPass | null>(null))
  .add("vnScript", ({ showItems }) => buildVnScript({ showItems }), ["showItems"])
  .add("vnEngine", ({ time, vnScript }) => VNEngine(vnScript, { now: () => time.peek() }), [
    "time",
    "vnScript",
  ])
  .add(
    "vnScene",
    buildVnScene,
    ["time", "vnActive", "vnPass", "vnEngine", "vnScript"],
    // CRITICAL on HMR: without cleanup, every vn-scene.ts hot update stacked another live
    // instance — each play then ran N preload→engine.start chains (a scene-reset race) and the
    // newest instance owned the render pass. See docs/hmr.md ("VN sprite after HMR").
    (scope) => scope.cleanup(),
  );

export const domusAppP = builder.run();

window.Kitsune = {
  updateDep: buildUpdateDepFn(domusAppP),
};
