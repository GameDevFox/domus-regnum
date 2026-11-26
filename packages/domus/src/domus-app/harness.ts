import type { RenderLoopHandle } from "../three-canvas/utils";

// A deterministic driver for the running app, so a screenshot test (or a human poking at the dev
// console) can advance the app by a chosen amount of *virtual* time — independent of wall-clock
// requestAnimationFrame — then trigger controls and capture a frame at a known state.
//
// Why this exists: the app's sims integrate `dt` off the frame clock, and RAF only ticks at the
// monitor's whim, so "let 3 seconds pass and then screenshot" isn't reproducible from the outside.
// The harness pauses RAF and replays frames at exact timestamps instead. Pair it with a headless
// browser (Playwright) that drives inputs + grabs the canvas — see docs/headless-harness.md.
//
//   pause()/resume()      — stop / restart the automatic RAF loop
//   advance(seconds, dt)  — replay `seconds` of virtual time in `dt`-ms steps (default 60fps),
//                           rendering each step so sims integrate as they would live; returns the
//                           new virtual time (ms)
//   step(frames, dt)      — advance a whole number of frames
//   now()                 — current virtual time (ms)
//   snapshot()            — the 3D canvas as a PNG data URL (works because the renderers are created
//                           with preserveDrawingBuffer: true), or null if no canvas was provided

export type Harness = {
  pause: () => void;
  resume: () => void;
  advance: (seconds: number, dt?: number) => number;
  step: (frames?: number, dt?: number) => number;
  now: () => number;
  snapshot: () => string | null;
};

const FRAME_MS = 1000 / 60;

export const createHarness = (
  loop: RenderLoopHandle,
  opts: { start?: number; canvas?: HTMLCanvasElement } = {},
): Harness => {
  let t = opts.start ?? 0;

  const pause = () => loop.stop();
  const resume = () => loop.start();

  const advance = (seconds: number, dt: number = FRAME_MS): number => {
    loop.stop(); // own the clock while stepping
    const end = t + seconds * 1000;
    // Step in dt increments so the per-frame sims see realistic deltas; the final step is clamped to
    // land exactly on `end` (so a non-multiple duration still ends where asked).
    while (t < end - 1e-6) {
      t = Math.min(t + dt, end);
      loop.frame(t);
    }
    return t;
  };

  const step = (frames = 1, dt: number = FRAME_MS): number => advance((frames * dt) / 1000, dt);

  const now = () => t;

  const snapshot = (): string | null =>
    opts.canvas ? opts.canvas.toDataURL("image/png") : null;

  return { pause, resume, advance, step, now, snapshot };
};
