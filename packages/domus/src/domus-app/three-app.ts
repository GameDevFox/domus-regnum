import type { Engine } from "@kitsune/vn";
import type { ThreeApp } from "@kitsune/common-web/src/react";
import { Value } from "@kitsune/common-web/src/value";

import type { ServantView } from "../world/household";

import { CameraMode, domusAppP } from ".";
import { setAnimationLoop } from "../three-canvas/utils";
import { createHarness } from "./harness";
import { LoadSession, runInitialLoad } from "./load-session";

let started = false;

// The game canvas's load session, published while the initial assets stream in. Started HERE at
// module load — not inside domusApp() — because the game app constructs ASYNC (it awaits the GLTF
// room model + materials), so by the time domusApp() resolves the assets are already loaded. Kicking
// the session off at import means `waitForHttpIdle` subscribes while the manager is still busy and
// actually reflects the load. The GPU pre-warm awaits the resolved app. A future area transition
// would publish another session here too. Exported so App.tsx can show the loader during construction
// (before `app` exists), not just after.
export const gameLoading = Value<LoadSession | null>(null);
void runInitialLoad(
  gameLoading,
  domusAppP.then((app) => ({
    renderer: app.data.renderer,
    scene: app.data.scene,
    camera: app.data.camera,
  })),
);

// A ThreeApp (so <ThreeView> can render it) plus the reactive state the React controls drive.
export type DomusSceneApp = ThreeApp & {
  state: {
    cameraMode: Value<CameraMode>;
    cameraZoom: Value<number>;
    showItems: Value<boolean>;
    showConsole: Value<boolean>;
    showBlocks: Value<boolean>;
    runHaul: Value<boolean>;
    runTidy: Value<boolean>;
    cleanliness: Value<number>;
    staff: Value<ServantView[]>;
    billboards: Value<boolean>;
    vnActive: Value<boolean>;
    vnEngine: Engine;
  };
};

// ThreeApp factory for <ThreeView>/useApp: the app owns its canvas (created by the Builder), so
// we hand back the renderer and reactive state, and start the (self-resizing) render loop once.
// A stable module-level reference, so the React layer keeps one persistent instance.
export const domusApp = (): Promise<DomusSceneApp> =>
  domusAppP.then((app) => {
    if (!started) {
      const loop = setAnimationLoop(app);
      started = true;
      // In dev, expose a deterministic driver on `window.domus` so a headless browser (or the dev
      // console) can pause RAF, advance virtual time, and snapshot a known frame. See harness.ts +
      // docs/headless-harness.md. Stripped from production builds.
      if (typeof window !== "undefined" && import.meta.env.DEV) {
        window.domus = createHarness(loop, {
          canvas: app.data.canvas,
        });
      }
    }
    const {
      renderer,
      cameraMode,
      cameraZoom,
      showItems,
      showConsole,
      showBlocks,
      runHaul,
      runTidy,
      cleanliness,
      staff,
      billboards,
      vnActive,
      vnEngine,
    } = app.data;
    return {
      renderer,
      state: {
        cameraMode,
        cameraZoom,
        showItems,
        showConsole,
        showBlocks,
        runHaul,
        runTidy,
        cleanliness,
        staff,
        billboards,
        vnActive,
        vnEngine,
      },
    };
  });
