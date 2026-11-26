import { MAIN_DECK, PLACES } from "./country";
import type { PlaceId, ThingId } from "./country";
import { CURIOS, curioFound, curiosAt } from "./curios";
import type { CurioId } from "./curios";
import { rand } from "./place";
import type { Game } from "./types";
import { SHOPS, SHOPS_AT } from "./wares";
import type { ShopId } from "./wares";

// How what a place holds is found: by pools of points, drawn and not put back (the author's
// model, 2026-11-16, worked out over several turns of talk; packages/domus/docs/design/22, "What a
// place holds is found in no set order"). In the author's words: "the items that are the most
// likely to be discovered have the most points in a pool, and the more rare items have less
// points in a pool. And they still have a required number of those points they need to get …
// every time we roll for points … we basically distribute the points evenly across all of the
// points that exist in all of the pools."
//
// - Each thing to be found has a POOL (how much of it there is about) and a NEED (how many of
//   its points must be come upon before it counts as found).
// - A place may have BLANK points besides, which count towards nothing: "a whole bunch of neutral
//   points that don't contribute to any of the shops, which kind of simulate the character going
//   down dead ends".
// - A minute of exploring makes so many draws. A STRAY draw takes one point at random from all
//   the points left in every pool, blanks and all. An AIMED draw takes one from the pool of the
//   thing she is on to (the target), which is rolled by what is left in each pool or is the one
//   nearest to found, as the place says. A place may have none aimed at all.
// - A pool whose thing is found either stays in the draw (berries are still all about the forest,
//   and still in the way of finding anything else) or is taken out of it (a shop that is known is
//   not looked for).
// - Gathering draws too, far fewer a minute, and never aimed: she learns the place by being in it.
//
// Nothing is put back, so once the pools are empty everything has been found: however the dice
// fall, a place is known after so many minutes at the most.
//
// A place has as many sets of pools as are wanted, called decks here, each what is said above:
// its things to find, its blanks, and its own draws a minute, of exploring and of gathering.
// Every minute each deck makes its own draws, and none knows of the others (the author,
// 2026-11-16: "how about we just have as many pools as a person wants on that area, and they're
// all run simultaneously"). So something can be made rarer or commoner without touching the
// figures of everything else. A place that says nothing of decks has one, the main one.
//
// Whether a thing is hidden (no question mark stands for it until it is found, and it counts for
// nothing in what is left to find) is said of the thing, not of the deck it is in.

/** A thing to be found: what it is, its pool, its need, whether its pool stays in the draw once it is found, and whether it is hidden until it is. */
export type Find = { id: string; pool: number; need: number; lingers: boolean; hidden?: boolean };

/** How one deck of a place is searched: its name, what there is to find in it, its blanks, the draws a minute of exploring makes of it and how what an aimed draw is aimed at is chosen, and the stray draws a minute of gathering makes of it. */
export type Searching = { id: string; finds: Find[]; blanks: number; aimed: number; stray: number; aim: "rolled" | "nearest"; gather: number };

/** How far a deck of a place has been searched: what is left in each pool and of the blanks, how many of each thing's points have been come upon, what she is on to, and the part of a minute not yet spent. */
export type Search = { left: Record<string, number>; got: Record<string, number>; blanks: number; target: string | null; owed: { explore: number; gather: number } };

export const newSearch = (searching: Searching): Search => ({ left: Object.fromEntries(searching.finds.map((f) => [f.id, f.pool])), got: {}, blanks: searching.blanks, target: null, owed: { explore: 0, gather: 0 } });

/** One of several, each as likely as its share of the whole: `chance` is a number from 0 up to 1. */
const oneOf = <T>(among: T[], sizeOf: (one: T) => number, chance: number): T | null => {
  const whole = among.reduce((sum, one) => sum + sizeOf(one), 0);
  let at = chance * whole;
  for (const one of among) {
    at -= sizeOf(one);
    if (at < 0) return one;
  }
  return among[among.length - 1] ?? null;
};

/**
 * So many draws of each kind are made at a place. `isFound` says what is known already (by
 * whatever means); `chance` is the dice. The ids of what these draws find are given back, in the
 * order they are found.
 */
export const draw = (search: Search, searching: Searching, draws: { aimed: number; stray: number }, isFound: (id: string) => boolean, chance: () => number): string[] => {
  const made: string[] = [];
  const known = (id: string): boolean => isFound(id) || made.includes(id);
  const take = (find: Find): void => {
    search.left[find.id] -= 1;
    search.got[find.id] = (search.got[find.id] ?? 0) + 1;
    if (!known(find.id) && search.got[find.id] >= find.need) made.push(find.id);
  };
  const unfound = (): Find[] => searching.finds.filter((f) => !known(f.id) && search.left[f.id] > 0);
  for (let n = 0; n < draws.aimed; n++) {
    const open = unfound();
    if (open.length === 0) break;
    // What she is on to: kept until it is found, then chosen afresh.
    let target = open.find((f) => f.id === search.target) ?? null;
    if (!target) {
      target = searching.aim === "nearest" ? [...open].sort((a, b) => a.need - (search.got[a.id] ?? 0) - (b.need - (search.got[b.id] ?? 0)))[0] : oneOf(open, (f) => search.left[f.id], chance());
      search.target = target?.id ?? null;
    }
    if (target) take(target);
  }
  for (let n = 0; n < draws.stray; n++) {
    // Every point left is as likely as any other: of a thing not yet found, of one found whose pool stays, or a blank.
    const pools = searching.finds.filter((f) => search.left[f.id] > 0 && (f.lingers || !known(f.id)));
    const points = pools.reduce((sum, f) => sum + search.left[f.id], 0);
    if (points + search.blanks <= 0) break;
    if (chance() * (points + search.blanks) < search.blanks) {
      search.blanks -= 1;
      continue;
    }
    const hit = oneOf(pools, (f) => search.left[f.id], chance());
    if (hit) take(hit);
  }
  if (search.target !== null && known(search.target)) search.target = null;
  return made;
};

/** What a discovery of a place is, by its id: a way on to another place, a thing that can be gathered there, a shop, or a curio. */
export type Found = { is: "way"; to: PlaceId } | { is: "thing"; thing: ThingId } | { is: "shop"; shop: ShopId } | { is: "curio"; curio: CurioId };

export const wayId = (to: PlaceId): string => `way:${to}`;
export const thingId = (thing: ThingId): string => `thing:${thing}`;
export const shopId = (shop: ShopId): string => `shop:${shop}`;
export const curioId = (curio: CurioId): string => `curio:${curio}`;

/** What something to be found at a place is, by its id: null if the place has no such thing. */
export const whatIs = (place: PlaceId, id: string): Found | null => {
  const lead = PLACES[place].leads.find((l) => wayId(l.to) === id);
  if (lead) return { is: "way", to: lead.to };
  const holding = PLACES[place].holds.find((h) => thingId(h.thing) === id);
  if (holding) return { is: "thing", thing: holding.thing };
  const curio = curiosAt(place).find((c) => curioId(c) === id);
  if (curio) return { is: "curio", curio };
  const shop = place === SHOPS_AT ? SHOPS.find((s) => shopId(s.id) === id) : undefined;
  return shop ? { is: "shop", shop: shop.id } : null;
};

/**
 * Everything to be found at a place, from what the place, the town's shops and the curios say of
 * themselves, each with the deck it is in: a way on, a shop and a curio are no longer looked for
 * once they are found; what grows there is still all about, and its pool stays in the draw. A
 * curio is hidden.
 */
const findsAt = (place: PlaceId): (Find & { deck: string })[] => {
  const { leads, holds } = PLACES[place];
  return [
    ...leads.map((l) => ({ id: wayId(l.to), pool: l.pool, need: l.need, lingers: false, deck: l.deck ?? MAIN_DECK })),
    ...(place === SHOPS_AT ? SHOPS.map((s) => ({ id: shopId(s.id), pool: s.pool, need: s.need, lingers: false, deck: s.deck ?? MAIN_DECK })) : []),
    ...holds.map((h) => ({ id: thingId(h.thing), pool: h.pool, need: h.need, lingers: true, deck: h.deck ?? MAIN_DECK })),
    ...curiosAt(place).map((c) => ({ id: curioId(c), pool: CURIOS[c].pool, need: CURIOS[c].need, lingers: false, hidden: true, deck: CURIOS[c].deck })),
  ];
};

/** How a place is searched as the code has it: deck by deck, in the order the place gives them, each with what is to be found in it. Made afresh at each asking, so that whoever is given it may do with it as they like. */
export const writtenAt = (place: PlaceId): Searching[] => {
  const finds = findsAt(place);
  // (What a thing is said to be in is its deck's to know, and not its own: it is dropped from the thing.)
  return Object.entries(PLACES[place].decks).map(([id, dials]) => ({ id, ...dials, finds: finds.filter((f) => f.deck === id).map((f): Find => ({ id: f.id, pool: f.pool, need: f.need, lingers: f.lingers, ...(f.hidden ? { hidden: true } : {}) })) }));
};

const copied = (deck: Searching): Searching => ({ ...deck, finds: deck.finds.map((f) => ({ ...f })) });

/**
 * How a place is searched in a game: as the code has it, but for any deck of it whose dials have
 * been set anew in that game (`retune`). Every rule that searches a place, or reads how far it has
 * been searched, reads its decks through this.
 */
export const searchingAt = (game: Game, place: PlaceId): Searching[] => writtenAt(place).map((deck) => copied(game.dials[place]?.[deck.id] ?? deck));

/** The deck of a place that something to be found there is in. */
const deckHolding = (game: Game, place: PlaceId, id: string): Searching | undefined => searchingAt(game, place).find((deck) => deck.finds.some((f) => f.id === id));

/**
 * The dials of one deck of a place are set anew, in one game (the dev menu's odds window): the
 * pool and need of each thing in it, its blanks, and its draws a minute of exploring and of
 * gathering. The deck is then searched afresh, since points drawn from pools of another size mean
 * nothing for these; what has been found there stays found, and the place's other decks are as
 * they were. Whether a thing's pool stays in the draw, and whether it is hidden, go by what the
 * thing is, and are not dials; nor is a thing the deck does not hold, or a deck the place does not
 * have. Set as the code has them, the deck holds no edit. No other game is changed by it, and
 * nothing the code has written.
 */
export const retune = (game: Game, place: PlaceId, deck: string, dials: Searching): void => {
  const written = writtenAt(place).find((one) => one.id === deck);
  if (!written) return;
  const { blanks, aimed, stray, aim, gather } = dials;
  const finds = written.finds.map((f) => {
    const given = dials.finds.find((one) => one.id === f.id);
    return given ? { ...f, pool: given.pool, need: given.need } : f;
  });
  const set: Searching = { ...written, blanks, aimed, stray, aim, gather, finds };
  const edits = (game.dials[place] ??= {});
  if (JSON.stringify(set) === JSON.stringify(written)) delete edits[deck];
  else edits[deck] = set;
  if (Object.keys(edits).length === 0) delete game.dials[place];
  delete game.searches[place]?.[deck];
};

/** A place's dials are put back as the code has them, in one game: its edits are dropped, and each deck that had one is searched afresh. */
export const putBack = (game: Game, place: PlaceId): void => {
  for (const deck of Object.keys(game.dials[place] ?? {})) delete game.searches[place]?.[deck];
  delete game.dials[place];
};

/** Whether something of a place has been found, by whatever means it was. */
export const isFoundAt = (game: Game, place: PlaceId, id: string): boolean => {
  const what = whatIs(place, id);
  if (!what) return false;
  if (what.is === "curio") return curioFound(game, what.curio);
  return what.is === "way" ? game.places[what.to] !== undefined : what.is === "shop" ? game.shops.includes(what.shop) : (game.finds[place] ?? []).includes(what.thing);
};

/** What is left to find at a place that can be seen to be left: what is hidden is not among it. */
export const leftToSee = (game: Game, place: PlaceId): { deck: Searching; find: Find }[] => searchingAt(game, place).flatMap((deck) => deck.finds.filter((find) => !find.hidden && !isFoundAt(game, place, find.id)).map((find) => ({ deck, find })));

/** Whether there is anything left to find at a place that can be seen to be left (what is hidden does not count). */
export const moreToFind = (game: Game, place: PlaceId): boolean => leftToSee(game, place).length > 0;

const searchOf = (game: Game, place: PlaceId, deck: Searching): Search => ((game.searches[place] ??= {})[deck.id] ??= newSearch(deck));

/** How near something of a place is to found, from 0 to 1: the share of the points it needs that have been come upon. */
export const nearness = (game: Game, place: PlaceId, id: string): number => {
  if (isFoundAt(game, place, id)) return 1;
  const deck = deckHolding(game, place, id);
  const need = deck?.finds.find((f) => f.id === id)?.need ?? 1;
  return Math.min(1, (game.searches[place]?.[deck?.id ?? MAIN_DECK]?.got[id] ?? 0) / need);
};

/** What exploring a place is on to just now, deck by deck, where a deck's draws are aimed at anything. */
export const targetsAt = (game: Game, place: PlaceId): { deck: Searching; target: string }[] =>
  searchingAt(game, place).flatMap((deck) => {
    const target = game.searches[place]?.[deck.id]?.target ?? null;
    return target === null ? [] : [{ deck, target }];
  });

/** Whether exploring a place is on to this thing just now. */
export const isTarget = (game: Game, place: PlaceId, id: string): boolean => targetsAt(game, place).some((one) => one.target === id);

/**
 * How much of one deck of a place has been gone over, from 0 to 1: of its points that have been
 * drawn or can still be, blanks and all, the share drawn. What is left in the pool of a thing
 * found and taken out of the draw counts neither way, so that it is the whole once nothing is
 * left to draw.
 */
export const combed = (game: Game, place: PlaceId, deck: string = MAIN_DECK): number => {
  const searching = searchingAt(game, place).find((one) => one.id === deck);
  if (!searching) return 1;
  const search = game.searches[place]?.[deck] ?? newSearch(searching);
  const drawn = searching.finds.reduce((sum, f) => sum + f.pool - search.left[f.id], 0) + searching.blanks - search.blanks;
  const drawable = searching.finds.filter((f) => f.lingers || !isFoundAt(game, place, f.id)).reduce((sum, f) => sum + search.left[f.id], 0) + search.blanks;
  return drawn + drawable === 0 ? 1 : drawn / (drawn + drawable);
};

/** Something of a place is found: it is so in the game, and who found it is marked. A curio is in her hands, to be brought home. */
const mark = (game: Game, who: string, place: PlaceId, id: string): void => {
  const what = whatIs(place, id);
  if (!what || isFoundAt(game, place, id)) return;
  if (what.is === "way") {
    game.places[what.to] = "unknown";
    game.feats.push({ who, what: "way", place, at: game.clock });
  } else if (what.is === "shop") {
    game.shops.push(what.shop);
    game.feats.push({ who, what: "shop", place, shop: what.shop, at: game.clock });
  } else if (what.is === "curio") {
    game.outings.find((o) => o.who === who)?.found.push(what.curio);
    game.feats.push({ who, what: "curio", place, curio: what.curio, at: game.clock });
  } else {
    (game.finds[place] ??= []).push(what.thing);
    game.feats.push({ who, what: "thing", place, thing: what.thing, at: game.clock });
  }
};

/**
 * Someone has been so many minutes at a place, exploring it or gathering in it: each whole
 * minute, each of its decks makes its own draws, and what they find is found. The ids of what
 * was found are given back.
 */
export const searchFor = (game: Game, who: string, place: PlaceId, minutes: number, how: "explore" | "gather"): string[] => {
  const found: string[] = [];
  for (const deck of searchingAt(game, place)) {
    const search = searchOf(game, place, deck);
    search.owed[how] += minutes;
    const draws = how === "explore" ? { aimed: deck.aimed, stray: deck.stray } : { aimed: 0, stray: deck.gather };
    while (search.owed[how] + NEAR_ENOUGH >= 1) {
      search.owed[how] -= 1;
      for (const id of draw(search, deck, draws, (other) => isFoundAt(game, place, other), () => rand(game))) {
        mark(game, who, place, id);
        found.push(id);
      }
    }
  }
  return found;
};
/** Sums of minutes go a hair astray. */
const NEAR_ENOUGH = 1e-6;

/**
 * For trying things out: the next draw from the deck something of a place is in is of its points,
 * where nothing else is in that deck (as the stone tablet is alone in the forest's rare one).
 * The deck's blanks are spent, and as many of its points as it still needs are put back.
 */
export const comeUponNext = (game: Game, place: PlaceId, id: string): void => {
  const deck = deckHolding(game, place, id);
  const find = deck?.finds.find((f) => f.id === id);
  if (!deck || !find) return;
  const search = searchOf(game, place, deck);
  search.blanks = 0;
  search.left[id] = Math.max(search.left[id], find.need - (search.got[id] ?? 0));
};
