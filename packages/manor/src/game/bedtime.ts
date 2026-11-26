import { giveOrders, go, isIdle } from "../space";
import type { Actor } from "../space";
import { isNight, nextWake } from "./clock";
import { isAt } from "./place";
import { BEDTIME, DAY, NIGHT_SECONDS, WAKE } from "./tuning";
import type { Game } from "./types";

// The night. At bedtime everyone goes up to her own bed; once everyone who is at home is in bed
// the night passes in a few seconds, with nothing in it, and everyone is up again at waking.
// Someone out of the house on an outing may stay out overnight: the house does not wait up.

/** Minutes of the night that go by in each second of it. */
const NIGHT_RATE = (DAY - BEDTIME + WAKE) / NIGHT_SECONDS;

/** Send someone up to bed, and notice when she is in it. Whatever she had in her arms is put down. */
export const goToBed = (game: Game, actor: Actor): void => {
  // In bed already, or on her way there.
  if (game.abed[actor.id] === "in" || (game.abed[actor.id] === "going" && !isIdle(actor))) return;
  const bed = game.beds[actor.id];
  if (isIdle(actor) && isAt(game.world, actor, bed)) game.abed[actor.id] = "in";
  else {
    game.abed[actor.id] = "going";
    giveOrders(game.world, actor.id, [{ do: "put" }, go(bed)]);
  }
};

/** True at night once everyone is in bed or away from the house: the night can pass. */
export const asleep = (game: Game): boolean => isNight(game.clock) && game.household.every((id) => game.abed[id] === "in" || game.outings.some((o) => o.who === id && o.state === "away"));

/** Move the night on. Nothing else in the house moves; at waking everyone is up. True at the moment of waking. */
export const passNight = (game: Game, dt: number): boolean => {
  const wake = nextWake(game.clock);
  game.clock = Math.min(wake, game.clock + dt * NIGHT_RATE);
  if (game.clock < wake) return false;
  game.abed = {};
  return true;
};
