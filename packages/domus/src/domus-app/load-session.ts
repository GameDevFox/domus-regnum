import { Camera, Scene, WebGLRenderer } from "three";

import { Value } from "@kitsune/common-web/src/value";

import { httpLoading, httpProgress } from "./loading";

// A "load session": the unit a canvas's loader overlay reflects. The initial load is just the first
// one; a later area transition that streams new assets opens another. A session spans BOTH buckets —
// bucket 1 (HTTP fetch + decode, tracked by the loading manager) and bucket 2 (GPU upload + shader
// compile, which the manager can't see) — so `progress` only reads 1.0 when the canvas is genuinely
// paint-ready, not merely "bytes downloaded". See docs/headless-harness.md / the loading discussion.
export type LoadPhase = "downloading" | "uploading" | "ready";
export type LoadSession = {
  label: Value<string>;
  progress: Value<number>; // 0..1 across both buckets
  phase: Value<LoadPhase>;
};

type Three = { renderer: WebGLRenderer; scene: Scene; camera: Camera };

// Wait until the shared loading manager is idle, reporting bucket-1 progress as 0..1. Resolves
// immediately when nothing is loading (so a transition whose assets are all resident doesn't stall),
// with a fallback timeout so a missed event can never hang the loader.
const waitForHttpIdle = (report: (p: number) => void): Promise<void> =>
  new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      unsubProgress();
      unsubLoading();
      clearTimeout(timer);
      resolve();
    };
    const tick = () => {
      const { loaded, total } = httpProgress.peek();
      report(total > 0 ? loaded / total : 1);
      if (!httpLoading.peek()) finish();
    };
    const unsubProgress = httpProgress._subscribe(tick);
    const unsubLoading = httpLoading._subscribe(tick);
    const timer = setTimeout(finish, 8000); // never hang on a missed event
    tick(); // resolve right away if already idle
  });

// Bucket 2: pre-warm the GPU for the current scene — compile shader programs (the big first-frame
// hitch) and force one render so textures upload — so the canvas is paint-ready when revealed
// instead of hitching/flashing on first draw. Defensive: a failure here must not hang the loader.
const prewarmGpu = async ({ renderer, scene, camera }: Three): Promise<void> => {
  try {
    await renderer.compileAsync(scene, camera);
    renderer.render(scene, camera); // forces texture upload
  } catch (err) {
    console.warn("[load] GPU pre-warm failed (continuing):", err);
  }
};

// Run a load session and publish it to `slot` while it's active. Debounced: work that finishes
// before `debounceMs` (everything already resident) never flashes the loader. `download` does
// bucket 1 (reporting 0..1); then we run bucket 2, mark ready, and clear.
export const runLoadSession = async (
  slot: Value<LoadSession | null>,
  opts: {
    label: string;
    three: Three | Promise<Three>; // may resolve later (the game app constructs async)
    download: (report: (p: number) => void) => Promise<void>;
    debounceMs?: number;
  },
): Promise<void> => {
  const session: LoadSession = {
    label: Value(opts.label),
    progress: Value(0),
    phase: Value<LoadPhase>("downloading"),
  };

  let shown = false;
  const timer = setTimeout(() => {
    shown = true;
    slot.set(session);
  }, opts.debounceMs ?? 120);

  // bucket 1 → 0..0.85 (leave headroom for the GPU phase)
  await opts.download((p) => session.progress.set(Math.min(Math.max(p, 0), 1) * 0.85));

  // bucket 2 → 0.85..1 (await the renderer first — the game app finishes constructing here)
  session.phase.set("uploading");
  session.progress.set(0.92);
  await prewarmGpu(await opts.three);
  session.progress.set(1);
  session.phase.set("ready");

  clearTimeout(timer);
  // If shown, leave it up briefly so the bar can reach 100% and fade; otherwise clear immediately.
  if (shown) setTimeout(() => slot.set(null), 350);
  else slot.set(null);
};

// The initial load every canvas app runs once: wait for the startup asset batch, then GPU pre-warm.
export const runInitialLoad = (
  slot: Value<LoadSession | null>,
  three: Three | Promise<Three>,
  label = "Loading…",
) => runLoadSession(slot, { label, three, download: waitForHttpIdle });
