import type { Actor, World } from "../space";

/** Nearer a spot than this, someone is at it. */
const AT_SPOT = 0.3;

export const isAt = (world: World, actor: Actor, spotId: string): boolean => {
  const spot = world.spots.get(spotId);
  if (!spot) throw new Error(`No such spot: ${spotId}`);
  const { pos } = actor.walker;
  return Math.abs(pos.y - world.plan.storeys[spot.floor].y) < AT_SPOT && Math.hypot(pos.x - spot.x, pos.z - spot.z) < AT_SPOT;
};

/**
 * Seeded chance (mulberry32), 0 up to 1: the game's own dice, drawn from `game.rng`. Not the only
 * chance there is: the odds window rolls dice of its own (`dice` in odds.ts).
 */
export const rand = (game: { rng: number }): number => {
  game.rng = (game.rng + 0x6d2b79f5) >>> 0;
  let t = game.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
