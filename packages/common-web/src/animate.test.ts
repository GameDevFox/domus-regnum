import { Vector3 } from "three";

import { Scope } from "./scope";
import { Value } from "./value";
import { frameDelta, spring, tween, lerp, numberAnimatable, easeInOut, linear } from "./animate";

// Drive the frame clock forward in fixed steps, like a render loop.
const advance = (time: Value<number>, ms: number, step = 16) => {
  let t = time.peek();
  const end = t + ms;
  while (t < end) {
    t = Math.min(t + step, end);
    time.set(t);
  }
};

describe("animate — Animatable / lerp / easing", () => {
  it("lerp over numberAnimatable interpolates the endpoints", () => {
    expect(lerp(numberAnimatable, 0, 10, 0)).toBe(0);
    expect(lerp(numberAnimatable, 0, 10, 0.5)).toBe(5);
    expect(lerp(numberAnimatable, 0, 10, 1)).toBe(10);
  });

  it("easeInOut and linear hit 0/1 at the endpoints", () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(linear(0.42)).toBe(0.42);
  });
});

describe("animate — spring", () => {
  it("converges toward a static number goal", () => {
    const s = Scope();
    const time = Value(0);
    const goal = Value(0);
    const out = spring(s, time, goal, { stiffness: 120, damping: 20 });
    goal.set(10);
    advance(time, 2000);
    expect(out.peek()).toBeGreaterThan(9.5);
    expect(out.peek()).toBeLessThanOrEqual(10.0001);
  });

  it("works on Vector3 goals (and yields a fresh instance, not the goal)", () => {
    const s = Scope();
    const time = Value(0);
    const goal = Value(new Vector3(0, 0, 0));
    const out = spring(s, time, goal, { stiffness: 120, damping: 20 });
    const target = new Vector3(5, 0, 0);
    goal.set(target);
    advance(time, 2000);
    expect(out.peek().x).toBeGreaterThan(4.5);
    expect(out.peek()).not.toBe(target); // never mutates the goal instance
  });
});

describe("animate — tween", () => {
  it("reaches the goal after its duration and is mid-way before", () => {
    const s = Scope();
    const time = Value(0);
    const goal = Value(0);
    const out = tween(s, time, goal, { duration: 0.5, easing: linear });
    goal.set(100);

    advance(time, 250); // half the duration
    const mid = out.peek();
    expect(mid).toBeGreaterThan(30);
    expect(mid).toBeLessThan(70);

    advance(time, 300); // past the duration
    expect(out.peek()).toBe(100);
  });
});

describe("animate — spring settling", () => {
  it("a Vector3 spring SETTLES: snaps to the goal and stops emitting at rest", () => {
    const s = Scope();
    const time = Value(0);
    const goal = Value(new Vector3(0, 0, 0));
    const out = spring(s, time, goal, { stiffness: 120, damping: 22 });
    goal.set(new Vector3(2, 0, 0));
    advance(time, 3000); // far past convergence

    expect(out.peek().x).toBe(2); // snapped EXACTLY onto the goal
    let fires = 0;
    out._subscribe(() => fires++);
    advance(time, 500); // half a second at rest…
    expect(fires).toBe(0); // …without a single emission

    goal.set(new Vector3(0, 0, 3)); // a new goal un-settles it
    advance(time, 100);
    expect(fires).toBeGreaterThan(0);
    expect(out.peek().z).toBeGreaterThan(0);
  });

  it("number springs settle exactly too", () => {
    const s = Scope();
    const time = Value(0);
    const goal = Value(0);
    const out = spring(s, time, goal);
    goal.set(10);
    advance(time, 3000);
    expect(out.peek()).toBe(10);
  });
});

describe("frameDelta", () => {
  it("emits clamped dt in seconds per advancing frame, including identical fixed steps", () => {
    const s = Scope();
    const time = Value(1000);
    const delta = frameDelta(s, time, { maxStep: 0.05 });
    const seen: number[] = [];
    s.effect((use) => {
      const dt = use(delta);
      if (dt > 0) seen.push(dt);
    });

    time.set(1016); // 16 ms
    time.set(1032); // identical 16 ms step — must still fire
    time.set(1032 + 500); // long gap → clamped
    expect(seen).toEqual([0.016, 0.016, 0.05]);
  });

  it("swallows zero and backward steps", () => {
    const s = Scope();
    const time = Value(0, { equals: () => false }); // let identical times through to the effect
    const delta = frameDelta(s, time);
    let fires = 0;
    delta._subscribe(() => fires++);
    time.set(0); // dt 0
    time.set(-5); // backward
    expect(fires).toBe(0);
    time.set(10);
    expect(fires).toBe(1);
  });
});
