import { isNight } from "./clock";
import { searchFor } from "./discovery";
import { atAPlace, gathersIn, idleAhead, isAsking, isFixed, isHomeNext, isPayer, leaveBy, lotsOf, partyOutings, refund, settle } from "./outing";
import { send, whyNot, whyNotAll } from "./outing-send";
import { priceOf } from "./sales";
import { BASKET_HOLDS, GATHER_LEARNS } from "./tuning";
import type { Ask, AskWhy, Did, Game, Goods, NotNow, Outing } from "./types";
import { WARES } from "./wares";

// Someone at a place: she finds it, if it was not found; does there what she was sent for; and,
// with that done, goes on to what she has queued next (outing-queue.ts), or, with nothing
// queued, asks what she is to do next, and time stands still until she is told (outing-tell.ts).
// Queued next, the walk home is taken without asking; and she turns for home, whatever is
// queued, if she must leave now to be at the door by bedtime. If what is queued next cannot be
// done when she comes to it, she stops and asks, and skips nothing. Nothing is asked at night:
// what she does in the night is reckoned when the house wakes. A party (outing-party.ts) is
// moved on as one, by the first of it: each does her own work, and they ask once. Finding the
// place she was sent to, she asks, and what she was sent to do there is put first in her queue,
// so that she is told to go on with it (⏭️) rather than to do it again (the playtest of
// 2026-11-17, 1.2: Explore sent to a place not yet found was dropped on finding it).

/** The reasons she asks that are what she was at coming to an end: the question says what it was. */
const ENDINGS: AskWhy[] = ["done", "full", "time", "stopped", "stuck"];

/** What she is at, as the question says it: the thing, and the ware or the goods. Nothing, at nothing. */
const didOf = (outing: Outing): Did | undefined => (outing.doing === null ? undefined : { doing: outing.doing, ...(outing.buys ? { ware: outing.buys } : {}), ...(outing.sells ? { good: outing.sells } : {}) });

/**
 * She asks what she is to do next, and is at nothing until she is told: were she told to come
 * home, she would set off now. `did` is what came to an end, where that is why she asks; `stuck`,
 * what is queued next that cannot be done. Out with a party, the party asks, once.
 */
export const askNow = (game: Game, outing: Outing, why: AskWhy, news?: string[], did: Did | undefined = didOf(outing), stuck?: Ask["stuck"]): void => {
  const [lead, ...rest] = partyOutings(game, outing);
  game.asks.push({ who: lead.who, place: lead.to, why, ...(rest.length > 0 ? { with: rest.map((one) => one.who) } : {}), ...(news && news.length > 0 ? { news } : {}), ...(did && ENDINGS.includes(why) ? { did } : {}), ...(stuck ? { stuck } : {}) });
  for (const one of [lead, ...rest]) {
    Object.assign(one, { doing: null, buys: null, sells: null, seeks: null, waits: false });
    delete one.stopped;
    one.depart = game.clock;
    settle(one);
  }
};

/**
 * After going on (`goOn`): gone, she asks nothing; with nothing left queued, she asks `plain`;
 * else what is queued next cannot be done, and she asks why. (Never a "stuck" question with no
 * step to name.)
 */
export const askUnlessOn = (game: Game, outing: Outing, on: boolean | NotNow, plain: AskWhy, did?: Did): void => {
  if (on === true) return;
  if (on === false || outing.queue.length === 0) askNow(game, outing, plain, undefined, did);
  else askNow(game, outing, "stuck", undefined, did, { next: outing.queue[0], why: on, plain });
};

/** She turns for home, setting off at `at` (never before she was there): a ware not yet bought is refunded, what she has she brings, and what was queued is dropped. */
export const goHome = (game: Game, outing: Outing, at: number): void => {
  refund(game, outing);
  Object.assign(outing, { sells: null, waits: false, homeward: true, queue: [] });
  outing.depart = Math.max(outing.arrive, at);
  settle(outing);
};

/** Goods put together: so many lots of each. */
const together = (a: Goods, b: Goods): Goods => {
  const all: Goods = { ...a };
  for (const [good, lots] of Object.entries(b) as [keyof Goods, number][]) all[good] = (all[good] ?? 0) + lots;
  return all;
};

/** A purchase or a sale is done: the ware is hers (in a party, the one who paid has it), or what she carried of the goods is coin in her purse. */
const finish = (outing: Outing): void => {
  if (outing.buys !== null && isPayer(outing)) outing.bought[outing.buys] = (outing.bought[outing.buys] ?? 0) + WARES[outing.buys].lot;
  if (outing.sells !== null) {
    outing.purse += (outing.basket[outing.sells] ?? 0) * priceOf(outing.sells);
    delete outing.basket[outing.sells];
  }
  outing.buys = null;
  outing.sells = null;
};

/**
 * Her minutes exploring or gathering since they were last counted, up to when it is done at the
 * latest: gathering fills her basket; and they go over the place, exploring it in earnest, or,
 * gathering, by being about it. What they find is found (discovery.ts), and is returned. Buying
 * and selling go over nothing: the town is no better known for them.
 */
const work = (game: Game, outing: Outing): string[] => {
  const { to, who } = outing;
  if (isFixed(outing.doing)) return [];
  // Not before she had left the house, were she ever so late.
  const from = Math.max(outing.counted, outing.left ?? outing.arrive);
  const upTo = Math.min(game.clock, outing.depart);
  if (upTo <= from) return [];
  const minutes = upTo - from;
  outing.counted = upTo;
  outing.spent += minutes;
  if (outing.doing === "gather") outing.basket = together(outing.kept, gathersIn(game, to, outing.spent, BASKET_HOLDS - lotsOf(outing.kept)));
  game.explored[to] = (game.explored[to] ?? 0) + minutes * (outing.doing === "explore" ? 1 : GATHER_LEARNS);
  const news = searchFor(game, who, to, minutes, outing.doing === "explore" ? "explore" : "gather");
  outing.news += news.length;
  return news;
};

/** Why she has nothing left to do, if she has not: what she was at being done, or never having been anything. A party gathering is done when every basket is full. */
const whyDone = (game: Game, party: Outing[], news: string[]): AskWhy | null => {
  const [outing] = party;
  if (outing.doing === null) return outing.stopped ? "stopped" : "arrived";
  // Exploring, something has turned up (the author's list, 2026-11-16: "Instead of heading back after a discovery it should instead ask her what she wants to do next (which includes heading back)").
  if (outing.doing === "explore" && news.length > 0) return "found";
  if (outing.doing === "gather" && party.every((one) => lotsOf(one.basket) >= BASKET_HOLDS)) return "full";
  if (game.clock < outing.depart) return null;
  return isFixed(outing.doing) ? "done" : "time";
};

/**
 * She goes on to what she has queued next, if anything: true if she went, false with nothing
 * queued, and why not if it cannot be done. The walk home she takes at once. What is to be done
 * where she is, she begins now; what is elsewhere, she goes there to do first, by the roads there
 * are, and begins when she is there (so what is bought is paid for then). Only going to where she
 * is already is nothing to do, and is let go. On the road to the place of it, she goes on there.
 */
export const goOn = (game: Game, outing: Outing): boolean | NotNow => {
  const party = partyOutings(game, outing);
  const [lead] = party;
  const at = atAPlace(game, lead);
  const idle = idleAhead(game, lead);
  for (const one of party) one.queue.splice(0, idle);
  const [next] = lead.queue;
  if (!next) return false;
  if (isHomeNext(next)) {
    for (const one of party) goHome(game, one, Math.min(game.clock, one.depart));
    return true;
  }
  const bound = next.to === lead.to;
  if (bound && !at) return true;
  const ids = party.map((one) => one.who);
  const why = whyNotAll(game, ids, next, lead.terms, true);
  if (why !== null) return why;
  // Free of what she was at, she is sent from where she is: to it, here; else only to go there.
  if (at) for (const one of party) Object.assign(one, { doing: null, waits: true });
  const sent = send(game, lead.who, bound ? next : { to: next.to, doing: null }, lead.terms);
  if (!sent) return whyNot(game, lead.who, next, lead.terms) ?? "nothing";
  if (bound) for (const one of party) one.queue.shift();
  return true;
};

/** She is at the place she was bound for: move her time there on. A party is moved on by the first of it, once every one of it is out at the gate. */
export const atPlace = (game: Game, outing: Outing): void => {
  if (isNight(game.clock)) return;
  const party = partyOutings(game, outing);
  if (party[0] !== outing || party.some((one) => one.state !== "away")) return;
  const { to, who } = outing;
  const finds = game.places[to] !== "found";
  if (finds) {
    game.places[to] = "found";
    game.feats.push({ who, what: "found", place: to, at: game.clock });
  }
  if (outing.homeward || isAsking(game, who)) return;
  const leave = leaveBy(outing);
  // Waiting with something queued (added while she waited), she goes on to it.
  if (outing.waits && outing.queue.length > 0) {
    askUnlessOn(game, outing, goOn(game, outing), "arrived");
    return;
  }
  // Told to stay, she waits, and would set off home from now, until she must leave for bed.
  if (outing.waits) {
    for (const one of party) {
      if (game.clock >= leave) goHome(game, one, leave);
      else {
        one.depart = game.clock;
        settle(one);
      }
    }
    return;
  }
  // (Each of a party does her own work: her own basket, her own draws.)
  const news = finds || outing.doing === null ? [] : party.flatMap((one) => work(game, one));
  const why = finds ? "place" : whyDone(game, party, news);
  // (What she was at, as it was before a purchase or a sale is done and put by.)
  const did = didOf(outing);
  if (why === "done") party.forEach(finish);
  // To be home before bed she leaves now, from whatever she is at; but a purchase or a sale is not left half done.
  if (game.clock >= leave && !(isFixed(outing.doing) && why === null)) {
    for (const one of party) goHome(game, one, why === "done" ? Math.max(leave, one.depart) : leave);
    return;
  }
  if (why === null) return;
  // (Sent to explore or gather a place not yet found, that waits first in her queue while she asks: a purchase or a sale, of a fixed length, is not left so.)
  if (why === "place" && outing.doing !== null && !isFixed(outing.doing)) for (const one of party) one.queue.unshift({ to, doing: outing.doing, carried: true });
  // With that done she goes on to what is queued: the walk home asked for beforehand among it. (On finding something she still asks, as she always has, and her queue waits.)
  if (why !== "place" && why !== "found") {
    const on = goOn(game, outing);
    if (on === true) return;
    if (on !== false) return askNow(game, outing, "stuck", undefined, did, { next: outing.queue[0], why: on, plain: why });
  }
  askNow(game, outing, why, why === "found" ? news : undefined, did);
};
