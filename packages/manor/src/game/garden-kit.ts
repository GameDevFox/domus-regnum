import { PLOTS, SQUARES } from "./garden";
import { gameAt } from "./test-kit";
import type { Game } from "./types";

// What the garden's tests share: a house that knows potatoes, a square of a plot, and how many squares there are.

/** A game whose house knows potatoes as well as the wheat a new one begins with: these are written about a square of potatoes, which is watered, grown, pulled and sown again like any crop. */
export const withPotatoes = (minute?: number): Game => {
  const game = gameAt(minute);
  game.garden.known.push("potato");
  return game;
};
/** A square: the first of the first plot, unless another is said. */
export const bed = (game: Game, plot = 0, square = 0) => game.garden.plots[plot].squares[square];
/** Every square there is. */
export const ALL = PLOTS * SQUARES;
