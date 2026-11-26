// Human movement speeds + trapezoidal motion-profile math. Pure functions with no dependencies,
// so any sim (or anyone, once this library is open-sourced) can give agents momentum: accelerate
// from rest, cruise at top speed, brake to land exactly on the target.

// --- Reference speeds (m/s) ---------------------------------------------------------------------
// Grounded rather than invented:
//   WALK — ~3.0 mph was the standard 19th-century walking pace (3.5 mph counted as brisk for a
//   healthy young adult, and Dickens's sustained 4+ mph was considered remarkable). Modern gait
//   research puts preferred walking speed at ~1.4 m/s (3.1 mph), so the period figure agrees with
//   biomechanics. 3.0 mph = 1.34 m/s.
//   RUN — the average untrained adult sustains a 4–6 mph jog; we take the middle of the band,
//   5.6 mph = 2.5 m/s. (Victorian dress — corsets, long skirts, livery — argues for the modest
//   end of plausible.)
// Tune per character with a multiplier, not by editing these: `speed: HUMAN_WALK_SPEED * pace`
// where pace ≈ 0.8 (elderly, encumbered) … 1.2 (young, hurried).
//
// UNITS: metric throughout — metres per second, matching the world scale (1 unit = 1 m). The
// imperial figures above are sourcing only.
export const HUMAN_WALK_SPEED = 1.34; // m/s
export const HUMAN_RUN_SPEED = 2.5; // m/s

// Accelerations for the trapezoidal profile (m/s²). Gait-initiation studies have people reaching
// steady walking speed within a step or two (~1 s) — so walk accel ≈ walk speed per second; a
// standing start reaches jogging speed in about a second likewise. Same multiplier advice applies.
export const HUMAN_WALK_ACCEL = 1.2; // m/s²
export const HUMAN_RUN_ACCEL = 2.5; // m/s²

// --- Trapezoidal velocity profile ----------------------------------------------------------------
// Speed-vs-time for a journey is a trapezoid: ramp up at `accel`, cruise flat at `topSpeed`, ramp
// down to zero exactly at the destination. Trips too short to reach cruise become triangles —
// braking starts before the flat top — and every function below handles that case for free.

// Distance needed to brake from speed `v` to rest at `accel` (v² = 2·a·d).
export const brakingDistance = (v: number, accel: number): number => (v * v) / (2 * accel);

// The fastest speed that can still brake to rest within `remaining` distance — the cap that makes
// a profile land exactly on its target.
export const brakingSpeed = (remaining: number, accel: number): number =>
  Math.sqrt(2 * accel * Math.max(remaining, 0));

// One integration step of the profile: the velocity for the next tick, given the current one.
// Ramps up by accel·dt, capped by the top speed AND the braking constraint. Feed the result to
// `position += velocity * dt` each tick and the mover lands on its target.
export const trapezoidStep = (
  velocity: number,
  dt: number,
  opts: { accel: number; topSpeed: number; remaining: number },
): number =>
  Math.min(velocity + opts.accel * dt, opts.topSpeed, brakingSpeed(opts.remaining, opts.accel));

// Total seconds to cover `distance` from rest to rest under the profile (closed form):
//   trapezoid (cruise reached):  distance/topSpeed + topSpeed/accel
//   triangle (short trip):       2·√(distance/accel)
// With no accel given, movement is constant-speed: distance/topSpeed.
export const trapezoidDuration = (distance: number, topSpeed: number, accel?: number): number => {
  if (distance <= 0) return 0;
  if (accel === undefined) return distance / topSpeed;
  // Reaching topSpeed and braking back down each take topSpeed²/2a of distance.
  const rampDistance = topSpeed * topSpeed / accel; // accelerate + brake combined
  if (distance >= rampDistance) return distance / topSpeed + topSpeed / accel;
  return 2 * Math.sqrt(distance / accel);
};
