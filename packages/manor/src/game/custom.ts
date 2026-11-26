import { CUSTOM_STEP } from "./tuning";
import type { Game } from "./types";

// How much custom the shop has. A queue is never punished: someone who finds the counter full
// does not come in, and that is all. But a shop that sent nobody away yesterday is talked of,
// and more come today; one that did, stays as it was. So the custom grows for as long as the
// house keeps up with it, and stops where the house does.

/** Yesterday's trade is reckoned up as the house wakes. */
export const newMorning = (game: Game): void => {
  const { sold, lost } = game.today;
  if (sold > 0 && lost === 0) game.custom += CUSTOM_STEP;
  game.today = { sold: 0, lost: 0 };
};
