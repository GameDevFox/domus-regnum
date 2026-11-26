import { Vector3 } from "three";

import { Scope } from "./scope";
import { UsedAs, Value, peek } from "./value";

// --- Animatable ---------------------------------------------------------------
// The vector-space ops spring and tween need over a value type. `lerp` is derived,
// so both animators work on any type that supplies these — number and Vector3 are
// built in; pass your own (Color, Quaternion, …) via opts.animatable.
export type Animatable<T> = {
  zero: () => T; // additive identity (initial velocity / clone source)
  add: (a: T, b: T) => T;
  sub: (a: T, b: T) => T;
  scale: (a: T, s: number) => T;
  // Optional length measure — lets `spring` SETTLE (snap to the goal and stop notifying) once
  // position and velocity are both within epsilon. Without it a spring over a type whose ops
  // mint fresh instances (Vector3, …) emits a new value every frame forever, keeping every
  // downstream effect running at rest.
  magnitude?: (a: T) => number;
};

export const numberAnimatable: Animatable<number> = {
  zero: () => 0,
  add: (a, b) => a + b,
  sub: (a, b) => a - b,
  scale: (a, s) => a * s,
  magnitude: Math.abs,
};

export const vec3Animatable: Animatable<Vector3> = {
  zero: () => new Vector3(),
  add: (a, b) => a.clone().add(b),
  sub: (a, b) => a.clone().sub(b),
  scale: (a, s) => a.clone().multiplyScalar(s),
  magnitude: (a) => a.length(),
};

const resolveAnimatable = <T>(sample: T): Animatable<T> => {
  if (typeof sample === "number") return numberAnimatable as unknown as Animatable<T>;
  if (sample instanceof Vector3) return vec3Animatable as unknown as Animatable<T>;
  throw new Error("spring/tween: no built-in Animatable for this type — pass opts.animatable");
};

export const lerp = <T>(m: Animatable<T>, a: T, b: T, t: number): T =>
  m.add(a, m.scale(m.sub(b, a), t));

// --- Easings ------------------------------------------------------------------
export type Easing = (t: number) => number;
export const linear: Easing = (t) => t;
export const easeOut: Easing = (t) => 1 - (1 - t) * (1 - t);
export const easeInOut: Easing = (t) => t * t * (3 - 2 * t); // smoothstep

// --- frameDelta ---------------------------------------------------------------
// The per-frame time step, derived from the app's `time` Value (ms) as SECONDS — the intended
// way to run per-frame animation. Because it rides `time` (not a private RAF/performance.now),
// anything built on it follows a virtual clock (pause/advance test harnesses) for free, and the
// clamp keeps a background-tab gap from exploding physics. Fires once per advancing frame even
// when consecutive steps are identical (fixed-step harnesses); zero/backward steps are swallowed.
export type FrameDeltaOptions = {
  maxStep?: number; // seconds — clamp for tab-switch / breakpoint gaps
};

export const frameDelta = (
  scope: Scope,
  time: Value<number>,
  { maxStep = 0.05 }: FrameDeltaOptions = {},
): Value<number> => {
  let last = peek(time);
  // equals: () => false — repeated identical steps must still notify, or a fixed-step
  // consumer would tick exactly once.
  const out = Value(0, { equals: () => false });
  scope.effect((use) => {
    const t = use(time);
    const dt = Math.min(Math.max(t - last, 0) / 1000, maxStep);
    last = t;
    if (dt > 0) out.set(dt);
  });
  return out;
};

// --- spring -------------------------------------------------------------------
// Physics: continuously chases `goal`, carrying velocity across goal changes (so a
// moving target is absorbed smoothly). No fixed duration; settles asymptotically.
// New value each frame (functional ops produce fresh instances, so the Value fires).
export type SpringOptions<T> = {
  stiffness?: number; // pull toward the goal (higher = snappier)
  damping?: number; // resistance (≈ 2·√stiffness is critical; lower overshoots)
  animatable?: Animatable<T>;
  // Settle threshold (world units): when |goal − p| and |v| both drop below this, the spring
  // snaps to the goal and stops emitting until the goal changes. Only applies when the
  // Animatable provides `magnitude`. Default 1e-3 (sub-millimetre at 1 unit = 1 m).
  restEpsilon?: number;
};

export const spring = <T>(
  scope: Scope,
  time: Value<number>,
  goal: UsedAs<T>,
  { stiffness = 120, damping = 20, animatable, restEpsilon = 1e-3 }: SpringOptions<T> = {},
): Value<T> => {
  const m = animatable ?? resolveAnimatable(peek(goal));
  const copy = (x: T) => m.add(m.zero(), x);

  let last = peek(time);
  let p = copy(peek(goal));
  let v = m.zero();
  let settled = false;
  const out = Value(copy(p));

  scope.effect((use) => {
    const t = use(time);
    const g = use(goal);
    const dt = Math.min(Math.max(t - last, 0) / 1000, 0.05); // clamp so a pause can't explode it
    last = t;
    if (dt <= 0) return;

    // At rest (position AND velocity within epsilon): snap to the goal once and go quiet —
    // downstream effects stop re-running every frame. Any goal movement larger than epsilon
    // un-settles on the next tick.
    if (m.magnitude) {
      const atRest = m.magnitude(m.sub(g, p)) < restEpsilon && m.magnitude(v) < restEpsilon;
      if (atRest) {
        if (!settled) {
          settled = true;
          p = copy(g);
          v = m.zero();
          out.set(copy(g));
        }
        return;
      }
      settled = false;
    }

    // a = stiffness·(g − p) − damping·v ;  v += a·dt ;  p += v·dt
    const accel = m.sub(m.scale(m.sub(g, p), stiffness), m.scale(v, damping));
    v = m.add(v, m.scale(accel, dt));
    p = m.add(p, m.scale(v, dt));
    out.set(p);
  });

  return out;
};

// --- tween --------------------------------------------------------------------
// Time + easing: interpolates to `goal` over a fixed duration along a curve. When
// `goal` changes mid-flight it retargets *from the current value* (no velocity), so
// it has a known end time but restarts on a moving target. Stops firing once settled.
export type TweenOptions<T> = {
  duration?: number; // seconds
  easing?: Easing;
  animatable?: Animatable<T>;
};

export const tween = <T>(
  scope: Scope,
  time: Value<number>,
  goal: UsedAs<T>,
  { duration = 0.3, easing = easeInOut, animatable }: TweenOptions<T> = {},
): Value<T> => {
  const m = animatable ?? resolveAnimatable(peek(goal));
  const copy = (x: T) => m.add(m.zero(), x);

  let lastGoal = peek(goal);
  let from = copy(lastGoal);
  let to = copy(lastGoal);
  let start = peek(time);
  let current = copy(lastGoal);
  let done = true;
  const out = Value(copy(current));

  scope.effect((use) => {
    const t = use(time);
    const g = use(goal);
    if (!Object.is(g, lastGoal)) {
      from = current; // retarget from where we are now
      to = copy(g);
      start = t;
      lastGoal = g;
      done = false;
    }
    if (done) return;
    const k = duration > 0 ? Math.min(Math.max(t - start, 0) / 1000 / duration, 1) : 1;
    current = lerp(m, from, to, easing(k));
    out.set(current);
    if (k >= 1) done = true; // settled — stop firing until the goal changes again
  });

  return out;
};
