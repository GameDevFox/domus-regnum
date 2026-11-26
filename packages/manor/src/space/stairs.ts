import type { FloorId, Plan, Rect, Stair, Vec3 } from "./types";

// A flight is walked as a straight slope, but it is made of steps: this is the arithmetic both
// the drawing of a stair and the feet on it agree on.

/** The rise of one step a flight aims for; the real rise divides the storey evenly. */
const TARGET_RISE = 0.18;

export const riseOf = (plan: Plan, stair: Stair): number => plan.storeys[stair.upper].y - plan.storeys[stair.lower].y;

export const stepsOf = (plan: Plan, stair: Stair): number => Math.round(riseOf(plan, stair) / TARGET_RISE);

/**
 * The openings in a storey's floor where a flight comes up through it. The cellar's flight has
 * none: it goes down under the main one, through the door under the stairs.
 */
export const stairWells = (plan: Plan, floor: FloorId): Rect[] =>
  plan.stairs.filter((s) => s.upper === floor && s.lower !== "cellar").map((s) => ({ x: s.x - s.width / 2, z: Math.min(s.zFoot, s.zHead), w: s.width, d: Math.abs(s.zFoot - s.zHead) }));

/** The flight a point is on, if it is over one and between its two storeys. */
export const flightAt = (plan: Plan, pos: Vec3): Stair | null =>
  plan.stairs.find((s) => {
    const lowY = plan.storeys[s.lower].y;
    const between = pos.y >= lowY - 1e-6 && pos.y <= lowY + riseOf(plan, s) + 1e-6;
    const along = pos.z >= Math.min(s.zFoot, s.zHead) && pos.z <= Math.max(s.zFoot, s.zHead);
    return between && along && Math.abs(pos.x - s.x) <= s.width / 2;
  }) ?? null;

/** The height of the tread under a point on a flight: the floor at its foot, one step up just past it, and so on. */
export const treadHeight = (plan: Plan, stair: Stair, z: number): number => {
  const steps = stepsOf(plan, stair);
  const t = (z - stair.zFoot) / (stair.zHead - stair.zFoot);
  const step = t <= 0 ? 0 : Math.min(steps, Math.floor(t * steps) + 1);
  return plan.storeys[stair.lower].y + (step * riseOf(plan, stair)) / steps;
};
