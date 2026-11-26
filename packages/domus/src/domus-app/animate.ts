import { batch } from "@kitsune/common-web/src/value";

import { DomusApp } from ".";
import { watchLogGetAndClear } from "../common/watch-log";

// The per-frame loop, DELIBERATELY a short ordered function rather than a pile of reactive
// effects (decided 2026-06-09): trivially sequential mutations (the light flicker) read better
// top-to-bottom, and the console2d flush MUST run last — after everything has had its chance to
// watch.log() — which a plain loop guarantees and effect ordering wouldn't. Anything with real
// state or consumers gets extracted instead: the mascot wander lives in mascot-wander.ts
// (mounted by composition.ts, position published as a Value).

// Candle flicker: each candle light idles at BASE_*; once in a while it starts a dip that decays
// back over FLICKER_MAX_FRAMES.
const BASE_INTENSITY = 10;
const BASE_DISTANCE = 3.5;
const FLICKER_DEPTH = 1.5; // max intensity dip at the start of a flicker
const FLICKER_MAX_FRAMES = 30;
const FLICKER_REST_P = 0.97; // per-frame probability of NOT starting a flicker

export const buildAnimate = ({
  time: timeValue, console2d, sceneObjects,
}: Pick<DomusApp, "time" | "console2d" | "sceneObjects">) => {
  const { lights } = sceneObjects;

  const animate = (time: number) => {
    // Publish the frame time inside batch(): every effect sees ONE coherent update per frame,
    // even when it also reads a Value updated mid-frame (mascot position, sim outputs) — the
    // old double-fire-per-frame gotcha is gone (listeners flush deduped when the batch ends).
    batch(() => timeValue.set(time));

    // Flicker lights
    lights.slice(0, -2).forEach(light => {
      if((light.userData.flicker ?? 0) === 0) {
        light.intensity = BASE_INTENSITY;
        light.distance = BASE_DISTANCE;

        if(Math.random() > FLICKER_REST_P) { // Not every frame
          const random = Math.random();
          light.userData.flicker = random * FLICKER_MAX_FRAMES;
        }
      } else {
        const flicker = ((FLICKER_MAX_FRAMES - light.userData.flicker) / FLICKER_MAX_FRAMES);
        light.intensity = (flicker * FLICKER_DEPTH) + (BASE_INTENSITY - FLICKER_DEPTH);

        light.userData.flicker = Math.max(light.userData.flicker - 1, 0);
      }
    });

    // (Mascot wander — random A* walks on the floor graph — lives in mascot-wander.ts, mounted
    // by composition.ts. The fly camera lives in composition.ts's "fly" mode branch.)

    const logs = watchLogGetAndClear();
    console2d.set(logs.join("\n"));
  };

  return animate;
};

if (import.meta.hot) {
  import.meta.hot.accept();
  window.Kitsune?.updateDep("animate", buildAnimate);
}
