import { nextBedtime } from "./clock";
import { HOME, PLACES, walkMinutes } from "./country";
import type { Basket, PlaceId, ThingId } from "./country";
import { roadFrom, whereabouts } from "./road";
import { stallsKnown } from "./sales";
import { BASKET_HOLDS, ERRAND_MINUTES, OUTING_LIMITS, WALK_MINUTES_PER_SHEET } from "./tuning";
import type { Errand, Game, Goods, Outing, OutingDoing, Terms } from "./types";
import { SHOPS_AT, WARES, shopsKnown } from "./wares";
import type { WareId } from "./wares";

// An outing: someone sent out of the house, at any hour of the day, to a place on the map. She
// puts down what she was at, walks out at the front door and down the drive, and is gone at the
// gate; travels there, and does there what she was sent for; and is seen at the gate again,
// walks up the drive, and comes in at the door with all she has with her. She keeps her job: it
// is hers again when she is home.
//
// She is sent to do a thing, not for a length of time; or only to go somewhere, with nothing
// chosen to do there. When what she is at is done, or the time she may spend at it is up, or she
// comes to a place with nothing to do there, she does not come home of herself: she asks what
// she is to do next, and time stands still until she is told (the author, 2026-11-16, in
// packages/domus/docs/design/22-reset-direction.md, "An outing is a queue of steps, and she asks
// when it runs out"). She comes home without asking only if the return was asked for beforehand
// (`thenHome`), or if she was told to be home before bed and must leave now to be at the door by
// bedtime, which is earlier the farther off she is. Told nothing of bed, she may be out
// overnight: the house does not wait up (bedtime.ts), and what she does in the night is reckoned
// when the house wakes.
//
// What can be done so far. In town, a ware is bought (wares.ts), which takes what is left of an
// errand's two hours once she has walked there and back; or what she carries is sold (sales.ts),
// in the same time. Anywhere but home the place is explored: the first visit puts it on the map
// as itself, and her minutes there draw on what it holds (discovery.ts). And a place where
// something to gather has been found can be gathered in: she fills her basket with all of it
// that has been found there, each thing at its own pace, and learns a little of the place the
// while, far less than by exploring it. What she has with her adds up, outing long.
//
// The files: this one has what is reckoned of an outing; outing-send.ts the sending and the
// re-sending; outing-place.ts her time at a place and her asking; outing-tell.ts what she can be
// told then, and calling her home; outing-queue.ts what she is to do after what she is at;
// outing-party.ts several sent out together; outing-step.ts the walk out and the coming in;
// outing-steps.ts her steps, for whoever shows them.

/** Sums of minutes go a hair astray; a lot is picked when the minutes are this near what it takes to pick it. */
const NEAR_ENOUGH = 1e-6;

/** Unless told otherwise: as long as it takes, up to the longest there is; home before bed; and asking, not coming home, when it is done. */
export const USUAL_TERMS: Terms = { limit: OUTING_LIMITS[OUTING_LIMITS.length - 1], homeByBed: true, thenHome: false };

/**
 * The place exploring is out to find: the place itself, while it has not been found. Null once
 * it has: what it holds is then found in no set order (discovery.ts), and she is out for
 * whatever turns up first.
 */
export const seeksAt = (game: Game, place: PlaceId): PlaceId | null => (game.places[place] !== "found" ? place : null);

/** The things a place holds that have been found there: only those can be gathered. */
export const foundAt = (game: Game, place: PlaceId): ThingId[] => PLACES[place].holds.map((h) => h.thing).filter((thing) => (game.finds[place] ?? []).includes(thing));

/**
 * What can be done at a place, as the house knows it. Anywhere but home it is explored, found or
 * not, whether or not anything is left to find there (the author, 2026-11-16: "the Explore button
 * should always be available even if 100% is reached, and even if there are no other hidden items
 * there. That will keep them guessing"); and gathered in once it is found and holds something.
 */
export const doingsAt = (game: Game, place: PlaceId): OutingDoing[] => {
  if (place === HOME) return [];
  // In town: something is bought once a shop has been found, and sold once a stall that buys has been found.
  if (place === SHOPS_AT) return [...(shopsKnown(game).some((shop) => shop.buys.length === 0) ? ["buy" as const] : []), ...(stallsKnown(game).length > 0 ? ["sell" as const] : []), "explore"];
  // Anywhere else: gathered in once something that can be gathered has been found there.
  return ["explore", ...(game.places[place] === "found" && foundAt(game, place).length > 0 ? ["gather" as const] : [])];
};

/** How many lots there are in a basket, of every kind. */
export const lotsOf = (goods: Goods): number => Object.values(goods).reduce((sum, lots) => sum + (lots ?? 0), 0);

/**
 * What someone gathering at a place for so many minutes has picked: a lot of each thing that has
 * been found there, every so often, each at its own pace, until there is no more room (her
 * basket, unless she has less room than that).
 */
export const gathersIn = (game: Game, place: PlaceId, minutes: number, room: number = BASKET_HOLDS): Basket => {
  const known = foundAt(game, place);
  // Every lot she could pick in the time, and when; the basket takes them in the order they are picked.
  const picks = PLACES[place].holds
    .filter(({ thing }) => known.includes(thing))
    .flatMap(({ thing, every }, order) => Array.from({ length: Math.floor((minutes + NEAR_ENOUGH) / every) }, (_, n) => ({ thing, at: (n + 1) * every, order })))
    .sort((a, b) => a.at - b.at || a.order - b.order)
    .slice(0, Math.max(0, room));
  const basket: Basket = {};
  for (const { thing } of picks) basket[thing] = (basket[thing] ?? 0) + 1;
  return basket;
};

/** How long is spent in town buying or selling: what is left of the errand's two hours once she has walked there and back. */
export const shoppingMinutes = (): number => ERRAND_MINUTES - 2 * walkMinutes(SHOPS_AT);

/** What she will spend in town, for a ware: flour, unless another is named. */
export const errandCost = (ware: WareId = "flour"): number => WARES[ware].price;

/**
 * The clocks of an outing begun now, with so long at the place: there, setting off home, and at
 * the front door again. The walk is before and after what is done there. (`outward` is the walk
 * there, where it is not from the house: for someone turned on the road, or sent on.)
 */
const timesFor = (clock: number, to: PlaceId, stay: number, outward = walkMinutes(to)): { arrive: number; depart: number; back: number } => ({ arrive: clock + outward, depart: clock + outward + stay, back: clock + outward + stay + walkMinutes(to) });

/**
 * The clocks of an outing begun now on these terms, at the latest they can be: she is there a
 * walk from now, and has done there when her time at it is up, or must leave to be at the door by
 * bedtime if she was told to be, whichever is sooner. A place farther off is left the earlier.
 */
export const timesOf = (clock: number, to: PlaceId, terms: Terms, outward = walkMinutes(to)): { arrive: number; depart: number; back: number } => {
  const stay = Math.min(terms.limit, terms.homeByBed ? nextBedtime(clock) - walkMinutes(to) - (clock + outward) : Infinity);
  return timesFor(clock, to, stay, outward);
};

/** When someone sent into town now would be at the front door again, were she to come home once the errand is done. */
export const backAt = (clock: number): number => timesFor(clock, SHOPS_AT, shoppingMinutes()).back;

export const outingOf = (game: Game, id: string): Outing | undefined => game.outings.find((o) => o.who === id);

/** Everyone of someone's party, the first of them the one who pays; herself alone, out alone or at home. */
export const partyOf = (game: Game, id: string): string[] => outingOf(game, id)?.party ?? [id];

/** The outings of everyone of someone's party, in the party's order: her own alone, out alone. */
export const partyOutings = (game: Game, outing: Outing): Outing[] => (outing.party ? outing.party.map((who) => outingOf(game, who)).filter((o): o is Outing => o !== undefined) : [outing]);

/** Whether she is the one who pays for what her party buys: someone out alone always is. */
export const isPayer = (outing: Outing): boolean => !outing.party || outing.party[0] === outing.who;

/** Whether someone is asking what she is to do next: by herself, or with her party. */
export const isAsking = (game: Game, id: string): boolean => game.asks.some((ask) => ask.who === id || (ask.with ?? []).includes(id));

/** The walk home, as a step queued. */
export const HOME_NEXT: Errand = { to: HOME, doing: null };

/** Whether a step queued is the walk home. */
export const isHomeNext = (next: Errand): boolean => next.to === HOME;

/** Whether the walk home is the one thing queued after what she is at: then when she is home is known. */
export const homeNext = (outing: Outing): boolean => outing.queue.length === 1 && isHomeNext(outing.queue[0]);

/** How far, in minutes, someone is from a place: on the road, or at a place, from where she is; else (in the house, or on the drive going out) from the house. */
export const minutesTo = (game: Game, id: string, to: PlaceId): number => {
  const outing = outingOf(game, id);
  const where = outing && outing.state === "away" ? whereabouts(outing, game.clock) : null;
  return where ? roadFrom(where, to).length * WALK_MINUTES_PER_SHEET : walkMinutes(to);
};

/**
 * When someone would be at a place, have done there and be at the door, sent there now on these
 * terms: from the house; or, for someone on the road or at a place, from where she is.
 */
export const timesFrom = (game: Game, id: string, to: PlaceId, terms: Terms): { arrive: number; depart: number; back: number } => timesOf(game.clock, to, terms, minutesTo(game, id, to));

/** The clock by which she must leave where she is bound to be at the door by bedtime; never, if she was not told to be. */
export const leaveBy = (outing: Outing): number => (outing.bedBy === null ? Infinity : outing.bedBy - walkMinutes(outing.to));

/** Buying and selling take so long, and are never left half done. */
export const isFixed = (doing: OutingDoing | null): boolean => doing === "buy" || doing === "sell";

/** When a thing begun at the place at `start` is done at the latest: a purchase or a sale in its time; exploring or gathering when her time at it is up, or she must leave for bed; nothing at once. */
export const endOf = (outing: Outing, start: number): number => (outing.doing === null ? start : isFixed(outing.doing) ? start + shoppingMinutes() : Math.min(start + outing.terms.limit, leaveBy(outing)));

/** Her time home from the place follows from when she sets off; and the times are settled once she has turned for home, or is at a thing of fixed length with the walk home queued after it. */
export const settle = (outing: Outing): void => {
  outing.back = outing.depart + walkMinutes(outing.to);
  outing.done = outing.homeward || (homeNext(outing) && isFixed(outing.doing));
};

/** At the place she is bound for, and not yet turned for home: doing what she is there for, asking, or waiting. */
export const atAPlace = (game: Game, outing: Outing): boolean => outing.state === "away" && outing.to !== HOME && !outing.homeward && game.clock >= outing.arrive;

/** How many of the steps queued first are only going to the place she is at: nothing to do, and let go as she goes on. None, away from a place. */
export const idleAhead = (game: Game, outing: Outing): number => {
  if (!atAPlace(game, outing)) return 0;
  const first = outing.queue.findIndex((next) => next.doing !== null || isHomeNext(next) || next.to !== outing.to);
  return first < 0 ? outing.queue.length : first;
};

/** What she would go on to next, were she to go on now: what is queued first, past any going to where she is. */
export const nextUp = (game: Game, outing: Outing): Errand | undefined => outing.queue[idleAhead(game, outing)];

/** On the road: on her way to a place, or home, or not yet out at the gate; not at a place, nor on the drive coming in. */
export const onTheRoad = (game: Game, outing: Outing): boolean => outing.state === "leaving" || (outing.state === "away" && (game.clock < outing.arrive || outing.homeward));

/** At a place with nothing she is at there: asking what she is to do next, or told to stay. */
export const isFree = (game: Game, outing: Outing): boolean => atAPlace(game, outing) && (outing.waits || isAsking(game, outing.who));

/** The price of a ware she was to buy and has not bought is the house's again (in a party, only the one who paid it has it to give back). */
export const refund = (game: Game, outing: Outing): void => {
  if (outing.buys !== null && isPayer(outing)) game.coin += errandCost(outing.buys);
  outing.buys = null;
};

/**
 * Her outing is over (she is in, or never went): it is taken off the list, and she is of her
 * party no longer, so that the rest are a party without her (or each out alone, if one is left)
 * and her next outing is her own. A party holds only those out together now.
 */
export const endOuting = (game: Game, outing: Outing): void => {
  game.outings.splice(game.outings.indexOf(outing), 1);
  for (const one of game.outings) {
    if (!one.party?.includes(outing.who)) continue;
    one.party = one.party.filter((who) => who !== outing.who);
    if (one.party.length < 2) delete one.party;
  }
};

/** Her question, if she is asking, is taken off the list: her party's too, which is the same question. */
export const dropAsk = (game: Game, id: string): void => {
  game.asks = game.asks.filter((ask) => ask.who !== id && !(ask.with ?? []).includes(id));
};
