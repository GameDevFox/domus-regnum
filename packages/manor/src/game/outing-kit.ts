import { timesOf } from "./outing";
import { quiet } from "./test-kit";
import { BERRY_MINUTES } from "./tuning";
import type { Game, Outing, Terms } from "./types";

// What the outing tests share: the forest as it is found and known, a basket from it, and an outing as it is out of doors.

/** An outing as it is once she has stepped out of the door at `left`. */
export const out = (to: Outing["to"], sent: number, left: number, stay: number): Outing => ({ who: "sage", to, doing: "explore", state: "away", buys: null, sells: null, terms: atMost(stay), bedBy: null, basket: {}, kept: {}, bought: {}, purse: 0, found: [], homeward: true, waits: false, sent, left, ...timesOf(sent, to, atMost(stay)), done: false, seeks: null, news: 0, turned: null, counted: 0, spent: 0, setOff: true, gone: null, queue: [] });
/** A full basket from the forest, and the minute of gathering at which the last lot of it is picked: nine lots of berries at ten minutes each, and three of herbs at twenty-five. */
export const FULL = { berries: 9, herbs: 3 };
export const FULL_AT = 9 * BERRY_MINUTES;
export const NOTHING = { berries: 0, herbs: 0 };
/** As long as it takes, up to so many minutes, and never mind bedtime; and, if `thenHome`, home when it is done, without asking. */
export const atMost = (limit: number, thenHome = false): Terms => ({ limit, homeByBed: false, thenHome });
/** The forest has been found, and nothing more is known of it: there is exploring to do there, and nothing yet to gather. */
export const forestFound = (): Game => {
  const game = quiet();
  game.places.forest = "found";
  return game;
};
/** The forest has been found, and so has what grows there: it can be gathered in, and only the way on is left to find. */
export const forestKnown = (): Game => {
  const game = forestFound();
  game.finds.forest = ["berries", "herbs"];
  return game;
};
/** Every point there is in the forest's pools (discovery.ts): 200 of berries, 120 of herbs, 8 of the way on. */
export const FOREST_POINTS = 328;
