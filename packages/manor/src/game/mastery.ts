import { MASTERY_LOAVES, MASTERY_PACE } from "./tuning";
import type { Game } from "./types";

// A mastery is had or it is not. It comes of practice: so many loaves baked, and from the next
// batch on her own part of the work goes twice as fast, all at once and for good. The oven is
// not hers to hurry.

/** How much faster a master's own work goes, as it is said: "twice as fast". */
export const PACE_SAYS = MASTERY_PACE === 2 ? "twice as fast" : `${MASTERY_PACE} times as fast`;

export const bakedBy = (game: Game, id: string): number => game.baked[id] ?? 0;

export const isMaster = (game: Game, id: string): boolean => bakedBy(game, id) >= MASTERY_LOAVES;

/** How many times as fast someone's own work goes: kneading, and taking things up and setting them down. */
export const handsPace = (game: Game, id: string): number => (isMaster(game, id) ? MASTERY_PACE : 1);

/** Loaves she has just set on the shelf count as hers. The batch that brings the mastery is marked as a feat, once. */
export const creditLoaves = (game: Game, id: string, loaves: number): void => {
  const before = isMaster(game, id);
  game.baked[id] = bakedBy(game, id) + loaves;
  if (!before && isMaster(game, id)) game.feats.push({ who: id, what: "bread", at: game.clock });
};
