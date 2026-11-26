import type { Game } from "./types";

// Places one person uses at a time: a place at the kitchen table, the oven. Whoever means to use
// one claims it before setting out, and gives it up when she has done.

/** Take a place if nobody else has it. True if it is hers now. */
export const claim = (game: Game, spot: string, id: string): boolean => {
  const holder = game.claims[spot];
  if (holder !== undefined && holder !== id) return false;
  game.claims[spot] = id;
  return true;
};

export const release = (game: Game, spot: string, id: string): void => {
  if (game.claims[spot] === id) delete game.claims[spot];
};

/** Give up everything someone had claimed: she has been taken off her job, or has gone to bed. */
export const releaseAll = (game: Game, id: string): void => {
  for (const spot of Object.keys(game.claims)) release(game, spot, id);
};
