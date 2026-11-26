import { BERRY_MINUTES, GATHER_DRAWS, HERB_MINUTES, WALK_MINUTES_PER_SHEET } from "./tuning";
import type { Game } from "./types";

// The country round the house: the places someone can be sent to, where each lies, and the ways
// between them. What the house knows of it is the game's (`game.places`): a place it has been to
// is found; one it has only heard is there is unknown; the rest are not on its map at all.

export type PlaceId = "manor" | "town" | "forest" | "lake" | "caves";

/** How well the house knows a place that is on its map. */
export type Known = "found" | "unknown";

/** A point of the map. The first sheet is one unit square: x runs east from its west edge, y south from its north edge. */
export type MapPoint = { x: number; y: number };

/** The set of pools (deck) a thing to be found is in, where it does not say: every place has one of that name (discovery.ts). */
export const MAIN_DECK = "main";

/** A way on from a place, to be found there: how many points of it there are about, how many must be come upon before it is found, and which of the place's decks they are in (the main one, unless it says) (discovery.ts). */
export type Lead = Readonly<{ to: PlaceId; pool: number; need: number; deck?: string }>;

/** The things that can be gathered out of doors and brought home. */
export type ThingId = "berries" | "herbs";
export const THINGS: Record<ThingId, { name: string; glyph: string }> = { berries: { name: "Berries", glyph: "🫐" }, herbs: { name: "Herbs", glyph: "🌿" } };
export const THING_IDS = Object.keys(THINGS) as ThingId[];
/** What a basket has in it: so many lots of each thing. */
export type Basket = Partial<Record<ThingId, number>>;
/** How many lots are in a basket, of whatever kind. */
export const lotsIn = (basket: Basket): number => THING_IDS.reduce((sum, thing) => sum + (basket[thing] ?? 0), 0);

/** Something a place holds, to be found there before it can be gathered (its pool and its need: discovery.ts); then one lot of it is gathered every so many minutes. Whoever gathers there gathers all of it that has been found, each at its own pace. */
export type Holding = Readonly<{ thing: ThingId; every: number; pool: number; need: number; deck?: string }>;

/**
 * How one of a place's decks is searched: the blank points it has besides what there is to find
 * in it, the draws a minute of exploring makes of it (aimed at one thing, and stray), how what is
 * aimed at is chosen, and the stray draws a minute of gathering makes of it (discovery.ts).
 */
export type Searched = Readonly<{ blanks: number; aimed: number; stray: number; aim: "rolled" | "nearest"; gather: number }>;
/** A minute of exploring makes four draws, all stray, and a minute of gathering one, unless a place says otherwise. */
const WANDERED: Searched = { blanks: 0, aimed: 0, stray: 4, aim: "rolled", gather: GATHER_DRAWS };
/** A place with one deck, the main one. */
const ONE_DECK = (search: Searched = WANDERED): Record<string, Searched> => ({ [MAIN_DECK]: search });

/** The forest's deck for what is rare there: a label for the dev menu's odds window, not a name in the game's world. */
export const RARE_DECK = "rare";

// Working names: what each place is, not what it is called. Names for the world are the author's to give.
// A place is as the code has it, and nothing writes into it: a game's own edits of its dials are the game's (discovery.ts, `retune`).
export type Place = Readonly<{ id: PlaceId; name: string; at: Readonly<MapPoint>; /** The ways on from it that exploring it finds. */ leads: readonly Lead[]; /** What can be gathered there. */ holds: readonly Holding[]; /** Its decks, by name: each is drawn from every minute, and knows nothing of the others. */ decks: Readonly<Record<string, Searched>> }>;

const PLACE_LIST: readonly Place[] = [
  { id: "manor", name: "The manor", at: { x: 0.5, y: 0.52 }, leads: [], holds: [], decks: ONE_DECK() },
  // The town: its shops are its pools (wares.ts), a few points each among a great many blanks, so that most are found soon and the last is a hunt
  // (the author's choice of pattern, 2026-11-16: "you find a bunch of the shops early, but then the last one is hard … that extra satisfying bit of
  // finally finding that last shop"). 600 points in all: at four draws a minute, everything is found within two and a half hours of exploring.
  { id: "town", name: "The town", at: { x: 0.63, y: 0.8 }, leads: [], holds: [], decks: ONE_DECK({ ...WANDERED, blanks: 583 }) },
  // The forest: pools alone. Berries and herbs are all about, and are found within half an hour; the way on to the caves is a few points among
  // hundreds, found late as a rule and now and then by luck (328 points: within 82 minutes of exploring at the most).
  // Beside them, a deck of its own for the stone tablet (curios.ts): its one point among 1079 blanks, two draws a minute of exploring and one of
  // gathering, so that it is come upon within 540 minutes of exploring, or 1080 of gathering (twelve baskets), at the latest.
  { id: "forest", name: "The forest", at: { x: 0.21, y: 0.47 }, leads: [{ to: "caves", pool: 8, need: 6 }], holds: [{ thing: "berries", every: BERRY_MINUTES, pool: 200, need: 40 }, { thing: "herbs", every: HERB_MINUTES, pool: 120, need: 40 }], decks: { ...ONE_DECK(), [RARE_DECK]: { blanks: 1079, aimed: 0, stray: 2, aim: "rolled", gather: 1 } } },
  { id: "lake", name: "The lake", at: { x: 0.8, y: 0.37 }, leads: [], holds: [], decks: ONE_DECK() },
  { id: "caves", name: "The caves", at: { x: 0.31, y: 0.21 }, leads: [], holds: [], decks: ONE_DECK() },
];

/** Where everyone sets out from, and comes back to. */
export const HOME: PlaceId = "manor";

export const PLACES = Object.fromEntries(PLACE_LIST.map((p) => [p.id, p])) as Readonly<Record<PlaceId, Place>>;
export const PLACE_IDS: PlaceId[] = PLACE_LIST.map((p) => p.id);

/** The ways from one place to the next: a place is reached only through one it is joined to. */
export const WAYS: [PlaceId, PlaceId][] = [
  ["manor", "town"],
  ["manor", "forest"],
  ["manor", "lake"],
  ["forest", "caves"],
];

/** The way from the house to a place by the ways there are: every place passed, the house first. */
export const wayTo = (to: PlaceId): PlaceId[] => {
  // Outward from the house, a place at a time, remembering how each was come to.
  const cameFrom = new Map<PlaceId, PlaceId | null>([[HOME, null]]);
  const reached: PlaceId[] = [HOME];
  for (const at of reached) {
    for (const [a, b] of WAYS) {
      const next = a === at ? b : b === at ? a : null;
      if (next === null || cameFrom.has(next)) continue;
      cameFrom.set(next, at);
      reached.push(next);
    }
  }
  const way: PlaceId[] = [];
  for (let at: PlaceId | null = cameFrom.has(to) ? to : null; at !== null; at = cameFrom.get(at) ?? null) way.unshift(at);
  return way;
};

/** The way from one place to another by the ways there are: every place passed, the first of them the one set out from. */
export const wayBetween = (from: PlaceId, to: PlaceId): PlaceId[] => {
  const [out, back] = [wayTo(from), wayTo(to)];
  // As far as the two ways from the house are one, they are not walked: she turns off where they part.
  let shared = 0;
  while (shared < out.length && shared < back.length && out[shared] === back[shared]) shared++;
  return [...out.slice(Math.max(0, shared - 1)).reverse(), ...back.slice(shared)];
};

/** How far it is along a way, in the map's units. */
export const wayLength = (way: PlaceId[]): number => way.slice(1).reduce((sum, id, n) => sum + Math.hypot(PLACES[id].at.x - PLACES[way[n]].at.x, PLACES[id].at.y - PLACES[way[n]].at.y), 0);

/** How long the walk from the house to a place is, in minutes, one way: distance on the map is distance on foot. */
export const walkMinutes = (to: PlaceId): number => Math.round(wayLength(wayTo(to)) * WALK_MINUTES_PER_SHEET);

/** What the house knows on the first morning: its own town, and that there is something either side of it. */
export const firstMap = (): Partial<Record<PlaceId, Known>> => ({ manor: "found", town: "found", forest: "unknown", lake: "unknown" });

/** The places on the house's map, found or not, in a fixed order. */
export const onMap = (game: Game): Place[] => PLACE_LIST.filter((p) => game.places[p.id] !== undefined);

/** The ways the map shows: those with a place it knows of at each end. */
export const waysOnMap = (game: Game): [PlaceId, PlaceId][] => WAYS.filter(([a, b]) => game.places[a] !== undefined && game.places[b] !== undefined);
