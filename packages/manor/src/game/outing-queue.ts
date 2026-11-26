import { HOME } from "./country";
import { HOME_NEXT, dropAsk, isAsking, isFree, isHomeNext, nextUp, outingOf, partyOf, partyOutings, settle } from "./outing";
import { goHome } from "./outing-place";
import { send, whyNotAll } from "./outing-send";
import type { Errand, Game, NotNow, Outing, Terms } from "./types";

// What someone out is to do after what she is at, in order (the author agreed it "good for a
// first pass", 2026-11-16, in packages/domus/docs/design/22-reset-direction.md, "Queuing several
// steps ahead"): things at places, each where and what (to explore, gather, buy a ware, sell a
// good, or only go), and the walk home, which is always the last. When what she is at ends she
// goes on to the next (outing-place.ts, `goOn`); she asks what next only when all of it has run
// out. Whether a queued thing can be done (coin for the ware, something found there to gather,
// time before bed) is asked when she comes to it; and if it cannot be, she stops and asks, and
// skips nothing. What is bought is paid for then. A party has the one queue, each of it a copy.

/** Whether someone out can have more queued: not on her way home, nor coming in. */
const canQueue = (outing: Outing): boolean => !outing.homeward && outing.state !== "coming" && outing.state !== "returning";

/** Waiting at a place with nothing queued: what is added she begins at once, as if she were sent. */
const startsNow = (game: Game, outing: Outing): boolean => isFree(game, outing) && !isAsking(game, outing.who) && outing.queue.length === 0;

/**
 * Why a thing cannot be added after what someone is at, just now, if it cannot. At home, or
 * waiting with nothing queued, she would be sent to it now: why she cannot be. Else she must be
 * out and not asking (her question is answered first), nor on her way home; and the thing must
 * be at a place on the map that is not home. Whether it can be done there is asked when she
 * comes to it: by then what she explores first may have found what she is to gather, and what
 * she sells first may have made room in her basket.
 */
export const whyNotAdd = (game: Game, id: string, errand: Errand, terms: Terms): NotNow | null => {
  const outing = outingOf(game, id);
  if (!outing || startsNow(game, outing)) return whyNotAll(game, partyOf(game, id), errand, terms);
  if (!canQueue(outing) || isAsking(game, id)) return "out";
  return errand.to === HOME || game.places[errand.to] === undefined ? "nothing" : null;
};

/** The queue with a thing added at its end: before the walk home, which stays the last. */
const added = (queue: Errand[], errand: Errand): Errand[] => {
  const home = queue.findIndex(isHomeNext);
  return home < 0 ? [...queue, errand] : [...queue.slice(0, home), errand, ...queue.slice(home)];
};

/**
 * Add a thing after what someone is at: at the end of her queue (and of her party's), before the
 * walk home. At home, or waiting with nothing queued, she is sent to it now. Waiting with things
 * queued, she goes on to them. `terms.thenHome`: the walk home is queued last as well. True if
 * it was done.
 */
export const enqueue = (game: Game, id: string, errand: Errand, terms: Terms): boolean => {
  if (whyNotAdd(game, id, errand, terms) !== null) return false;
  const outing = outingOf(game, id);
  if (!outing || startsNow(game, outing)) return send(game, id, errand, terms);
  for (const one of partyOutings(game, outing)) {
    one.queue = added(one.queue, errand);
    if (terms.thenHome && !one.queue.some(isHomeNext)) one.queue.push(HOME_NEXT);
    settle(one);
  }
  // (Waiting, she goes on to it as her time there is next moved on: outing-place.ts.)
  return true;
};

/**
 * Asking because what was queued next cannot be done, her question is brought up to what is next
 * now: stuck on that, if it cannot be done either; else asked as she would have asked without
 * the step (`plain`), and ⏭️ goes on to what is next, if anything is.
 */
const askAfresh = (game: Game, outing: Outing): void => {
  const ask = game.asks.find((one) => one.who === outing.who || (one.with ?? []).includes(outing.who));
  if (!ask?.stuck) return;
  const next = nextUp(game, outing);
  const why = next && !isHomeNext(next) ? whyNotAll(game, partyOf(game, outing.who), next, outing.terms, true) : null;
  if (next && why !== null) ask.stuck = { ...ask.stuck, next, why };
  else {
    ask.why = ask.stuck.plain ?? "arrived";
    delete ask.stuck;
  }
};

/** Take one thing out of someone's queue (and her party's), by its place in it: asking because it could not be done, she asks afresh. False if there is none there, or she is on her way home. */
export const unqueue = (game: Game, id: string, index: number): boolean => {
  const outing = outingOf(game, id);
  if (!outing || !canQueue(outing) || index < 0 || index >= outing.queue.length) return false;
  for (const one of partyOutings(game, outing)) {
    one.queue = one.queue.filter((_, n) => n !== index);
    settle(one);
  }
  askAfresh(game, outing);
  return true;
};

/**
 * Ask beforehand, or no longer, that someone out (and her party) come home when all she is to do
 * is done, without asking: the walk home queued last, or taken out. Asking or waiting with
 * nothing else queued, there is nothing to be done first: she turns for home now. False for
 * someone not out, or on her way home.
 */
export const queueReturn = (game: Game, id: string, thenHome: boolean): boolean => {
  const outing = outingOf(game, id);
  if (!outing || !canQueue(outing)) return false;
  const party = partyOutings(game, outing);
  if (thenHome && isFree(game, outing) && !outing.queue.some((next) => !isHomeNext(next))) {
    dropAsk(game, id);
    for (const one of party) goHome(game, one, game.clock);
    return true;
  }
  for (const one of party) {
    const rest = one.queue.filter((next) => !isHomeNext(next));
    one.queue = thenHome ? [...rest, HOME_NEXT] : rest;
    settle(one);
  }
  return true;
};
