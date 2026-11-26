import { isNight, nextBedtime } from "./clock";
import { HOME } from "./country";
import type { PlaceId } from "./country";
import { HOME_NEXT, USUAL_TERMS, atAPlace, doingsAt, dropAsk, endOf, errandCost, isFixed, isFree, isHomeNext, isPayer, lotsOf, onTheRoad, outingOf, partyOf, partyOutings, refund, seeksAt, settle, timesFrom } from "./outing";
import { roadFrom, whereabouts } from "./road";
import { stallFor } from "./sales";
import { BASKET_HOLDS } from "./tuning";
import type { Errand, Game, Goods, NotNow, OutingDoing, Terms } from "./types";
import { SHOPS_AT, WARES, knowsShop, needless } from "./wares";
import type { GoodId, WareId } from "./wares";

// Sending someone out: from the house; or, someone already out, from where she is. On the road
// (on her way to a place or home from one) she is turned where she is (the author's list,
// 2026-11-16: "A character en route to or from a destinaiton should be able to reverse course if
// they get reassigned a new task"); at a place with nothing to do there (asking, or told to stay),
// what she is sent to do there begins at once, and anywhere else she goes on to by the roads
// there are, past the house without going in if the road lies that way. What she has with her
// stays with her: a ware she had been sent for and not yet bought is refunded, and goods she took
// to sell stay in her basket. Re-sent, she is given something else to do in place of what she
// was at; what she has queued after it is still to come (outing-queue.ts). Someone out with a
// party is sent with her party (outing-party.ts).

/** What she would have to sell of a thing: what she carries, if she is out; what the pantry has, if she is home. */
const haveToSell = (game: Game, id: string, good: GoodId): number => outingOf(game, id)?.basket[good] ?? (outingOf(game, id) ? 0 : game.stock[good]);

/**
 * Why someone cannot be sent on an errand just now, on these terms, if she cannot. Someone out is
 * sent only if she is on the road, or at a place with nothing to do there; not to sell but at the
 * town with what she carries (what is in the pantry is sold only by someone sent from the house);
 * and not to do what she is already on her way to do. Only buying wants coin, and what is bought
 * must be of some use. Told to be home before bed, she is not sent to a place she would have to
 * leave before she reached it (from the house, a purchase or a sale is not held to that: it is of
 * a fixed length, as it always was). `queued`: it is what she has queued next, and she is coming
 * to it (outing-queue.ts): where she is and the hour are no bar to it, only the thing itself.
 */
export const whyNot = (game: Game, id: string, errand: Errand, terms: Terms, queued = false): NotNow | null => {
  if (!game.household.includes(id)) return "nobody";
  const { to, doing } = errand;
  const outing = outingOf(game, id);
  if (outing && !queued) {
    if (!onTheRoad(game, outing) && !isFree(game, outing)) return "out";
    if (doing === "sell" && !(atAPlace(game, outing) && outing.to === SHOPS_AT)) return "out";
    const bound = outing.to === to && outing.doing === doing && outing.buys === (doing === "buy" ? (errand.ware ?? "flour") : null) && !outing.homeward;
    if (bound && (outing.state === "leaving" || game.clock < outing.arrive)) return "out";
    // (At a place, there is nothing to go to there.)
    if (doing === null && atAPlace(game, outing) && outing.to === to) return "out";
  }
  if (to === HOME || game.places[to] === undefined) return "nothing";
  if (isNight(game.clock) && !queued) return "night";
  if (doing !== null && !doingsAt(game, to).includes(doing)) return doing === "buy" || doing === "sell" ? "shop" : "nothing";
  if (doing === "buy") {
    const ware = errand.ware ?? "flour";
    // A ware she was to buy and has not is refunded as she is sent, by whoever of her party paid it: that coin is the house's to spend again.
    const payer = outing ? partyOutings(game, outing).find(isPayer) : undefined;
    const purse = game.coin + (payer?.buys ? errandCost(payer.buys) : 0);
    if (!knowsShop(game, WARES[ware].shop)) return "shop";
    if (needless(game, ware)) return "needless";
    if (purse < errandCost(ware)) return "coin";
  }
  if (doing === "sell") {
    const stall = errand.good ? stallFor(errand.good) : null;
    if (!errand.good || !stall || !knowsShop(game, stall.id)) return "shop";
    if (haveToSell(game, id, errand.good) < 1) return "nothing";
  }
  if (doing === "gather" && outing && lotsOf(outing.basket) >= BASKET_HOLDS) return "full";
  if (isFixed(doing) && !outing) return null;
  if (doing !== null && !isFixed(doing) && !(terms.limit > 0)) return "nothing";
  const times = timesFrom(game, id, to, terms);
  return times.depart <= times.arrive ? "late" : null;
};

/**
 * Why someone cannot be sent just now, if she cannot: for the cards of the places, which send her
 * to do one thing there (or, `doing` null, only to go). Without a plan, where she would go is not
 * known, and whether she would be late is not asked.
 */
export const whyNotSend = (game: Game, id: string, doing: OutingDoing | null = "buy", plan?: { to: PlaceId; terms: Terms }, ware: WareId = "flour"): NotNow | null => {
  const outing = outingOf(game, id);
  // Someone out, sent without a plan, is not on the road to be turned.
  if (!plan && outing && doing !== "buy") return "out";
  const to = plan?.to ?? SHOPS_AT;
  // (Out with a party, she is sent with it: as for the party, so that her face says what pressing it does.)
  return whyNotAll(game, partyOf(game, id), { to, doing, ware }, plan?.terms ?? (outing ? outing.terms : USUAL_TERMS));
};

/** Reasons that stand for a party only if they stand for every one of it: one with something to sell, or room in her basket, is enough. */
const EVERY_ONE: NotNow[] = ["nothing", "full"];

/** Why several people cannot be sent together on an errand just now, if they cannot: why any one of them cannot, but that none of them has anything to sell, or room to gather. One alone, as for her. */
export const whyNotAll = (game: Game, ids: string[], errand: Errand, terms: Terms, queued = false): NotNow | null => {
  const each = ids.map((id) => whyNot(game, id, errand, terms, queued));
  return each.find((why) => why !== null && !EVERY_ONE.includes(why)) ?? (each.every((why) => why !== null) ? each[0] : null);
};

/** Send someone on an errand on these terms, if she can be: from the house, or from where she is. Out with a party, the party is sent. */
export const send = (game: Game, id: string, errand: Errand, terms: Terms): boolean => {
  const party = partyOf(game, id);
  if (whyNotAll(game, party, errand, terms) !== null) return false;
  party.forEach((one, n) => begin(game, one, errand, terms, n === 0));
  return true;
};

/**
 * Set someone to an errand: one whom it has been seen can be sent. `pays`: she pays for what is
 * bought, as she is sent (a party pays once, the first of it).
 */
export const begin = (game: Game, id: string, errand: Errand, terms: Terms, pays: boolean): void => {
  const { to, doing } = errand;
  const outing = outingOf(game, id);
  if (outing) {
    refund(game, outing);
    dropAsk(game, id);
  }
  const buys = doing === "buy" ? (errand.ware ?? "flour") : null;
  if (buys && pays) game.coin -= errandCost(buys);
  // Sent from the house to sell, she takes all the house has of it, up to what her basket holds.
  const basket: Goods = { ...(outing?.basket ?? {}) };
  if (doing === "sell" && !outing && errand.good) {
    const lots = lotsToSell(game, errand.good);
    game.stock[errand.good] -= lots;
    basket[errand.good] = lots;
  }
  const here = outing !== undefined && atAPlace(game, outing) && outing.to === to;
  // (At the place already, it is no walk: she is there now.)
  const arrive = timesFrom(game, id, to, terms).arrive;
  // What is queued after it is still to come; the walk home, asked for as she is sent, is queued last.
  const queue = [...(outing?.queue ?? [])];
  if (terms.thenHome && !queue.some(isHomeNext)) queue.push(HOME_NEXT);
  // What she is sent to do, wherever she is sent from.
  const begun = { to, doing, buys, sells: doing === "sell" ? (errand.good ?? null) : null, terms: { limit: terms.limit, homeByBed: terms.homeByBed }, queue, bedBy: terms.homeByBed ? nextBedtime(game.clock) : null, basket, kept: { ...basket }, arrive, seeks: doing === "explore" ? seeksAt(game, to) : null, news: 0, homeward: false, waits: false, counted: arrive, spent: 0 };
  if (!outing) game.outings.push({ who: id, state: "leaving", bought: {}, purse: 0, found: [], sent: game.clock, left: null, turned: null, setOff: false, gone: null, depart: arrive, back: arrive, done: false, ...begun });
  else {
    // On the road, or bound from one place for another, she is turned where she is: her way there is from that point, and begins now. (Not yet out at the gate, she has no point but the house; at the place already, she begins there.)
    const where = outing.state === "away" && !here ? whereabouts(outing, game.clock) : null;
    delete outing.stopped;
    Object.assign(outing, begun, where ? { left: game.clock, turned: { from: where, via: roadFrom(where, to).via } } : here ? {} : { turned: null });
  }
  const sent = outingOf(game, id)!;
  sent.depart = endOf(sent, arrive);
  settle(sent);
};

/** Send someone to explore a place: to find what there is to find there. */
export const explore = (game: Game, id: string, to: PlaceId, terms: Terms = USUAL_TERMS): boolean => send(game, id, { to, doing: "explore" }, terms);

/** Send someone to gather what a place holds: to fill her basket. */
export const gather = (game: Game, id: string, to: PlaceId, terms: Terms = USUAL_TERMS): boolean => send(game, id, { to, doing: "gather" }, terms);

/** Send someone only to go to a place, with nothing chosen to do there: once there, she finds it if it was not found, and asks what she is to do. */
export const goTo = (game: Game, id: string, to: PlaceId, terms: Terms = USUAL_TERMS): boolean => send(game, id, { to, doing: null }, terms);

/**
 * Send someone into town to buy a ware (flour, unless another is named): from the house, or from
 * where she is. Its price leaves the house's coin as she is sent. `thenHome`: she is to come home
 * when it is bought, without asking.
 */
export const sendToTown = (game: Game, id: string, ware: WareId = "flour", thenHome = false): boolean => send(game, id, { to: SHOPS_AT, doing: "buy", ware }, { ...(outingOf(game, id)?.terms ?? USUAL_TERMS), thenHome });

/** Why someone cannot be sent from the house to sell a thing just now, if she cannot: the stall that deals in it must have been found, and there must be some of it in the house. */
export const whyNotSell = (game: Game, id: string, good: GoodId): NotNow | null => {
  if (!game.household.includes(id)) return "nobody";
  if (outingOf(game, id)) return "out";
  return whyNot(game, id, { to: SHOPS_AT, doing: "sell", good }, USUAL_TERMS);
};

/** How many lots of a thing someone sent from the house to sell it would take: all the house has, up to what her basket holds. */
export const lotsToSell = (game: Game, good: GoodId): number => Math.min(BASKET_HOLDS, Math.floor(game.stock[good]));

/**
 * Send someone from the house into town to sell a thing at the stall that deals in it: as many
 * lots as her basket holds, taken from the pantry as she goes. What it fetches is the house's
 * when she is in at the door; what she does not sell goes back to the pantry. `thenHome`: she is
 * to come home when it is sold, without asking.
 */
export const sellInTown = (game: Game, id: string, good: GoodId, thenHome = false): boolean => whyNotSell(game, id, good) === null && send(game, id, { to: SHOPS_AT, doing: "sell", good }, { ...USUAL_TERMS, thenHome });
