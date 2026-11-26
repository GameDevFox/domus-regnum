import { describe, expect, it, vi } from "vitest";

import { createHarness } from "./harness";
import type { RenderLoopHandle } from "../three-canvas/utils";

// A fake render loop that just records the timestamps it's asked to render. This lets us pin the
// deterministic-stepping contract without any Three/WebGL — the whole point of the harness is that
// "advance 3 seconds" is reproducible, so that's exactly what we assert.
const fakeLoop = () => {
  const frames: number[] = [];
  const loop: RenderLoopHandle = {
    frame: (t) => frames.push(t),
    stop: vi.fn(),
    start: vi.fn(),
  };
  return { loop, frames };
};

describe("createHarness", () => {
  it("replays a whole number of frames at exact timestamps", () => {
    const { loop, frames } = fakeLoop();
    const h = createHarness(loop, { start: 0 });
    h.advance(1, 100); // 1 second in 100ms steps
    expect(frames).toEqual([100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]);
    expect(h.now()).toBe(1000);
  });

  it("clamps the final step so a non-multiple duration lands exactly on the end", () => {
    const { loop, frames } = fakeLoop();
    const h = createHarness(loop, { start: 0 });
    h.advance(0.25, 100); // 250ms in 100ms steps → 100, 200, 250
    expect(frames).toEqual([100, 200, 250]);
    expect(h.now()).toBe(250);
  });

  it("continues monotonically across multiple advances", () => {
    const { loop, frames } = fakeLoop();
    const h = createHarness(loop, { start: 1000 });
    h.advance(0.2, 100);
    h.advance(0.1, 100);
    expect(frames).toEqual([1100, 1200, 1300]);
    expect(h.now()).toBe(1300);
  });

  it("stops the RAF loop before stepping and can resume it", () => {
    const { loop } = fakeLoop();
    const h = createHarness(loop, {});
    h.advance(0.05, 50);
    expect(loop.stop).toHaveBeenCalled();
    h.resume();
    expect(loop.start).toHaveBeenCalled();
  });

  it("step(n) advances exactly n frames at the default cadence", () => {
    const { loop, frames } = fakeLoop();
    const h = createHarness(loop, { start: 0 });
    h.step(3, 10);
    expect(frames).toHaveLength(3);
    expect(h.now()).toBeCloseTo(30);
  });

  it("returns null from snapshot() when no canvas is wired", () => {
    const { loop } = fakeLoop();
    expect(createHarness(loop, {}).snapshot()).toBeNull();
  });
});
