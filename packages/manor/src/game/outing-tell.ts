import { isNight } from "./clock";
import { HOME, onMap } from "./country";
import type { PlaceId } from "./country";
import { askUnlessOn, goHome, goOn } from "./outing-place";
import { atAPlace, doingsAt, dropAsk, endOuting, isAsking, isFree, isHomeNext, nextUp, outingOf, partyOf, partyOutings, refund, settle } from "./outing";
import { roadFrom, whereabouts } from "./road";
import { stallFor } from "./sales";
import { send, whyNotAll } from "./outing-send";
import type { Errand, NotNow } from "./types";
import { WALK_MINUTES_PER_SHEET } from "./tuning";
import type { Game, Outing } from "./types";
import { SHOPS_AT, knowsShop, shopsKnown, waresOf } from "./wares";
import type { GoodId, WareId } from "./wares";

// What someone out of doors can be told when she asks what she is to do next, or while she
// waits at a place: to explore there; to gather there, if something to gather has been found;
// in town, to buy a ware, or to sell what she carries; to go on to another place on the map; to
// stay where she is and do nothing (the author's list, 2026-11-16: "The "What next?" window needs
// an option to not do anything so she just stays there"); to go on with what she has queued, if
// she asked before it was done (on finding something, or with what is queued next not to be
// done); or to come home. Told anything but to stay, she is bound as she was when she was sent.
// And, whatever she is at: calling her home, and cancelling what she is to do. Whatever is told
// one of a party is told the party.

// (Asking for the walk home beforehand is queuing it: outing-queue.ts.)

/** What someone can be told: "explore", "gather", "home" and "stay" as they say; "on", to go on with what is queued; a ware to buy, goods to sell, or a place to go on to. */
export type Told = "explore" | "gather" | "home" | "stay" | "on" | { buy: WareId } | { sell: GoodId } | { go: PlaceId };

/** Something she can be told just now, and why she cannot do it, if she cannot (no coin, would not be home before bed, …). */
export type Choice = { told: Told; why: NotNow | null };

/** What being told something sends her to do: at the place she is at, or another. */
const errandOf = (here: PlaceId, told: Exclude<Told, "home" | "stay" | "on">): Errand => {
  if (told === "explore" || told === "gather") return { to: here, doing: told };
  if ("buy" in told) return { to: SHOPS_AT, doing: "buy", ware: told.buy };
  if ("sell" in told) return { to: SHOPS_AT, doing: "sell", good: told.sell };
  return { to: told.go, doing: null };
};

/** Whether she has something queued to go on to, past any going to where she is, that is not the walk home (which is told as "home"). */
const hasNext = (game: Game, outing: Outing): boolean => {
  const next = nextUp(game, outing);
  return next !== undefined && !isHomeNext(next);
};

/** Why someone cannot be told something just now, if she cannot. Only someone asking, or waiting at a place, is told anything, and only what she is offered (`choicesFor`); only someone asking is told to stay; to go on only someone with something queued, if it can be done, and not in the night. */
export const whyNotTell = (game: Game, id: string, told: Told): NotNow | null => {
  const outing = outingOf(game, id);
  if (!outing || !isFree(game, outing)) return "nobody";
  if (told === "home") return null;
  if (told === "stay") return isAsking(game, id) ? null : "out";
  const isOffered = offered(game, outing).some((one) => JSON.stringify(one) === JSON.stringify(told));
  if (told === "on") return !isOffered ? "nothing" : isNight(game.clock) ? "night" : whyNotAll(game, partyOf(game, id), nextUp(game, outing)!, outing.terms, true);
  const why = whyNotAll(game, partyOf(game, id), errandOf(outing.to, told), outing.terms);
  // (What is not offered her is not to be told her, whatever else might be said of it.)
  return isOffered ? why : (why ?? "nothing");
};

/** Everything someone free at a place is offered, whether or not it can be done just now. */
const offered = (game: Game, outing: Outing): Told[] => {
  const here = outing.to;
  const inTown = here === SHOPS_AT;
  const wares: Told[] = inTown ? shopsKnown(game).flatMap((shop) => waresOf(shop.id).map((ware) => ({ buy: ware.id }))) : [];
  // (What her party carries, any of it.)
  const baskets = partyOutings(game, outing).map((one) => one.basket);
  const goods: Told[] = inTown
    ? [...new Set(baskets.flatMap((basket) => Object.keys(basket) as GoodId[]))]
        .filter((good) => {
          const stall = stallFor(good);
          return baskets.some((basket) => (basket[good] ?? 0) >= 1) && stall !== null && knowsShop(game, stall.id);
        })
        .map((good) => ({ sell: good }))
    : [];
  const places: Told[] = onMap(game)
    .filter((place) => place.id !== HOME && place.id !== here)
    .map((place) => ({ go: place.id }));
  return [...doingsAt(game, here).filter((doing): doing is "explore" | "gather" => doing === "explore" || doing === "gather"), ...wares, ...goods, ...places, ...(isAsking(game, outing.who) ? ["stay" as const] : []), ...(hasNext(game, outing) ? ["on" as const] : []), "home"];
};

/**
 * Everything someone asking, or waiting at a place, can be told just now, each with why she
 * cannot do it if she cannot: to explore; to gather, where something to gather has been found;
 * in town, to buy each ware of every shop found, and to sell each kind of goods she carries that
 * a stall found buys; to go on to every other place on the map; to stay, if she is asking; to go
 * on with what is queued, if anything is; and to come home. Nothing, for anyone else. Nothing
 * else can be told her (`whyNotTell`).
 */
export const choicesFor = (game: Game, id: string): Choice[] => {
  const outing = outingOf(game, id);
  if (!outing || !isFree(game, outing)) return [];
  return offered(game, outing).map((one) => ({ told: one, why: whyNotTell(game, id, one) }));
};

/** Tell someone asking, or waiting at a place, what she is to do, and let time go on. False if it cannot be done: the question stands. */
export const tell = (game: Game, id: string, told: Told): boolean => {
  if (whyNotTell(game, id, told) !== null) return false;
  const outing = outingOf(game, id)!;
  if (told === "home") return callHome(game, id);
  // Told to stay, she waits, and does nothing more: what was queued, the walk home among it, is no longer to come.
  if (told === "stay") {
    dropAsk(game, id);
    for (const one of partyOutings(game, outing)) Object.assign(one, { waits: true, queue: [] });
    return true;
  }
  if (told === "on") {
    dropAsk(game, id);
    // (Offered only with something to go on to, past any going to where she is: `nextUp`. Were there nothing after all, she asks plainly.)
    const on = goOn(game, outing);
    askUnlessOn(game, outing, on, "arrived");
    return on === true;
  }
  const errand = errandOf(outing.to, told);
  // Asking on finding the place, what she was sent for there waits first in her queue (outing-place.ts): told something else to do instead, or the same, it is not done after it as well.
  const onFinding = game.asks.some((ask) => (ask.who === id || (ask.with ?? []).includes(id)) && ask.why === "place");
  const [first] = outing.queue;
  const carried = onFinding && first?.carried === true;
  if (!send(game, id, errand, outing.terms)) return false;
  if (carried) for (const one of partyOutings(game, outing)) one.queue.shift();
  return true;
};

/** Tell whoever is asking first what she is to do. False if nobody is asking, or it cannot be done. */
export const answer = (game: Game, told: Told): boolean => {
  const [ask] = game.asks;
  return ask !== undefined && tell(game, ask.who, told);
};

/**
 * Turn someone for home now, from wherever she is: at a place (asking, waiting or at work), she
 * leaves now; on the road out, she turns round where she is and walks home from that point; not
 * yet out at the gate, she comes straight in again, or, not yet set off for the door, stays in.
 * The price of a ware not yet bought is the house's again. Someone coming up the drive or putting
 * things away is not stopped; nor is anyone on her way home already.
 */
export const callHome = (game: Game, id: string): boolean => {
  const party = partyOf(game, id);
  // (The price is back first, from whoever paid it, while the party is as it was: one who stays in leaves it, and the next would be taken for the payer.)
  const outing = outingOf(game, id);
  if (outing) for (const one of partyOutings(game, outing)) refund(game, one);
  return party.map((one) => callOne(game, one)).every(Boolean);
};

/** Turn one of a party, or someone out alone, for home: what is queued is dropped. */
const callOne = (game: Game, id: string): boolean => {
  const outing = outingOf(game, id);
  if (!outing || outing.state === "coming" || outing.state === "returning") return false;
  dropAsk(game, id);
  refund(game, outing);
  outing.queue = [];
  if (outing.homeward) return true;
  Object.assign(outing, { doing: null, sells: null, seeks: null, waits: false });
  // Not yet set off for the door: she has gone nowhere, and what she took to sell is on its shelf again.
  if (outing.state === "leaving" && !outing.setOff) {
    for (const [good, lots] of Object.entries(outing.basket) as [GoodId, number][]) game.stock[good] += lots;
    endOuting(game, outing);
    return true;
  }
  if (atAPlace(game, outing)) {
    goHome(game, outing, game.clock);
    return true;
  }
  // On the road out: home is where she is bound now, from where she is (or, not yet out at the gate, from the gate).
  const where = outing.state === "away" ? whereabouts(outing, game.clock) : null;
  const road = where ? roadFrom(where, HOME) : null;
  Object.assign(outing, { to: HOME, homeward: true, arrive: game.clock + (road ? road.length * WALK_MINUTES_PER_SHEET : 0) }, where && road ? { left: game.clock, turned: { from: where, via: road.via } } : { turned: null });
  outing.depart = outing.arrive;
  settle(outing);
  return true;
};

/**
 * Cancel what someone is to do, or is doing, and go on to what is queued after it. At it, she
 * stops now and goes on to what is queued, or, with nothing queued, asks. Still on her way, she
 * turns for what is queued next where she is: for home, or for another place; and goes on to the
 * place she was bound for if that is where it is to be done, or nothing is queued, and asks there
 * (or begins it). A ware not yet bought is refunded. False with nothing to cancel: asking,
 * waiting, sent only to go, on her way home, or coming in.
 */
export const cancel = (game: Game, id: string): boolean => {
  const outing = outingOf(game, id);
  if (!outing || outing.homeward || outing.state === "coming" || outing.state === "returning" || outing.doing === null) return false;
  const party = partyOutings(game, outing);
  const [lead] = party;
  for (const one of party) refund(game, one);
  if (atAPlace(game, outing)) {
    // In the night she stops, and asks (or goes on) when the house wakes: nothing is asked in the night.
    if (isNight(game.clock)) {
      for (const one of party) Object.assign(one, { doing: null, sells: null, seeks: null, stopped: true });
      return true;
    }
    askUnlessOn(game, lead, goOn(game, lead), "stopped");
    return true;
  }
  for (const one of party) {
    Object.assign(one, { doing: null, sells: null, seeks: null });
    one.depart = one.arrive;
    settle(one);
  }
  const [next] = lead.queue;
  if (next && isHomeNext(next)) return callHome(game, id);
  if (next) goOn(game, lead);
  return true;
};
