import { HOME, PLACES, THINGS, WARES, goodOf, priceOf } from "../game";
import type { Game, GoodId, OutingStatus, PlaceId, ThingId } from "../game";
import { pronounsOf } from "./map-places";

// What someone on an outing is at, put two ways: a few signs for where there is little room (the
// list of the household, the label under her token on the map), and in words for a tooltip and
// a screen reader. What she is at is the rules' to say (`outingStatus`).

/** Bound for the place she was sent to; bound for home. */
const WALKING = "🚶";
const HOMEWARD = "🏠";
const ASKING = "❓";
/** At a place with nothing to do there, and not asking. */
const WAITING = "✋";
const EXPLORING = "🧭";
const COIN = "🪙";
/** Gathering, before the first lot is picked. */
const BASKET = "🧺";
/** Minutes are summed a step at a time and come out a hair long: twenty is shown as twenty. */
const HAIR = 1e-6;

/** Whole minutes still to go: a part of a minute is a minute, and she is never "0 minutes" off. */
export const left = (minutes: number): number => Math.max(1, Math.ceil(minutes - HAIR));
export const minutesSays = (count: number): string => `${count} minute${count === 1 ? "" : "s"}`;
const lotsSay = (lots: number, thing: ThingId): string => `${lots} lot${lots === 1 ? "" : "s"} of ${THINGS[thing].name.toLowerCase()}`;
/** So many of what she sells: things gathered are counted in lots, and what the garden bears one by one. */
export const goodsSay = (count: number, good: GoodId): string => (good in THINGS ? lotsSay(count, good as ThingId) : `${count} ${goodOf(good).name.toLowerCase()}`);
/** What a sale would fetch, on the town's card: so many of the goods, counted as the outing counts them, at the price of each. Of whoever is sent. */
export const saleSays = (count: number, good: GoodId): string => `${goodsSay(count, good)}, at ${priceOf(good)} coin each: ${count * priceOf(good)} coin, when she is home`;
/** A place as it is spoken of: by its name once it has been found, and not before. */
export const placeSays = (game: Game, place: PlaceId): string => (game.places[place] === "found" ? PLACES[place].name.toLowerCase() : "a place not yet visited");

/** In a few signs: what she is at and how far on. Nothing, while she is in the house. */
export const statusShort = (status: OutingStatus): string => {
  switch (status.is) {
    case "walking":
      return `${status.to === HOME ? HOMEWARD : WALKING} ${left(status.minutes)} min`;
    case "asking":
      return ASKING;
    case "waiting":
      return WAITING;
    case "buying":
      return `${WARES[status.ware].glyph} ×${status.load}`;
    case "selling":
      return `${goodOf(status.good).glyph} ×${status.load} → ${COIN}`;
    case "gathering":
      return status.picked.length > 0 ? status.picked.map(({ thing, lots }) => `${THINGS[thing].glyph} ×${lots}`).join(" ") : `${BASKET} ×0`;
    case "exploring":
      // The compass alone: how far on she is is said on the place's card, not under her (outing-status.ts).
      return EXPLORING;
    default:
      return "";
  }
};

/** In words: where she is and what she is at. `id`: whose outing, for her or his pronouns (who-says.ts); with none, a party's or anyone's, as "she". */
export const statusSays = (game: Game, status: OutingStatus, id?: string): string => {
  const p = pronounsOf(id);
  switch (status.is) {
    case "leaving":
      return `on ${p.possessive} way out of the house`;
    case "coming":
      return "coming up the drive";
    case "returning":
      return `home, and putting away what ${p.subject} brought`;
    case "walking":
      return `on the way to ${placeSays(game, status.to)}, ${minutesSays(left(status.minutes))} off${status.idle ? `, with nothing chosen to do there: ${p.subject} asks when ${p.subject} is there` : ""}`;
    case "asking":
      return `at ${placeSays(game, status.at)}, asking what ${p.subject} is to do`;
    case "waiting":
      return `waiting at ${placeSays(game, status.at)}`;
    case "buying":
      return `at ${placeSays(game, status.at)}, buying ${WARES[status.ware].name.toLowerCase()}${status.ware === "flour" ? `: ${status.load} sacks` : ""}, and ${minutesSays(left(status.minutes))} more`;
    case "selling":
      return `at ${placeSays(game, status.at)}, selling ${goodsSay(status.load, status.good)}, and ${minutesSays(left(status.minutes))} more there`;
    case "gathering":
      return `at ${placeSays(game, status.at)}, gathering: ${status.picked.length > 0 ? `${status.picked.map(({ thing, lots }) => lotsSay(lots, thing)).join(", ")}; ${status.load} of the ${status.holds} ${p.possessive} basket holds` : "nothing yet"}`;
    case "exploring":
      return `at ${placeSays(game, status.at)}, exploring`;
  }
};
