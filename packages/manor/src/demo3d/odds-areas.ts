import { GATHER_DRAWS, MAIN_DECK, PLACES, PLACE_IDS, searchingAt, writtenAt } from "../game";
import type { Game, PlaceId, Searching } from "../game";
import { findSays } from "./find-says";
import { rememberedText } from "./remember";

// The areas the odds window can show (odds-room.ts). An area is a place's decks, each a set of
// buckets (a thing to be found with its pool of points and its need) with the dials of its own
// draws. One is either a place of the game's, whose dials are the game's own; or a place of its
// own that is nowhere in the game, made to try figures out for a place there might one day be,
// and kept in this browser.

/** A thing to be found: its name and picture, which of the chart's colours is its own, its dials, and whether it is hidden in the game (which is not a dial). */
export type Bucket = { id: string; name: string; glyph: string; slot: number; pool: number; need: number; lingers: boolean; hidden?: boolean };
/** A deck of an area: its name, its things, and its own draws a minute, of exploring and of gathering. */
export type Deck = { id: string; buckets: Bucket[]; blanks: number; aimed: number; stray: number; gather: number; aim: "rolled" | "nearest" };
export type Area = { id: string; name: string; /** The place of the game's that this is, or null for one that is nowhere in it. */ place: PlaceId | null; decks: Deck[] };

/** As many buckets as the chart has colours to tell apart: an area holds no more, in all its decks together. */
export const MOST_BUCKETS = 8;
/** The most any dial may be set to. */
export const MOST = { pool: 100_000, need: 100_000, blanks: 1_000_000, draws: 60 };
/** What a new area begins as: two things, one plentiful and one scarce, among some dead ends; and a new deck, the scarce one alone. */
const BEGINS = { plenty: { pool: 40, need: 8 }, scarce: { pool: 6, need: 2 }, blanks: 100, stray: 4 };
/** The names new buckets are given, in turn. */
const LETTERS = "ABCDEFGH";
/** What a deck after the first of an area of one's own is called: this and its number. */
const DECK_STEM = "set";

/** Every bucket of an area, deck after deck. */
export const bucketsOf = (area: Area): Bucket[] => area.decks.flatMap((deck) => deck.buckets);

/** The dials of an area, deck by deck, as the game's rules take them. */
export const searchingOf = ({ decks }: Area): Searching[] =>
  decks.map(({ id, buckets, blanks, aimed, stray, gather, aim }) => ({ id, finds: buckets.map(({ id: find, pool, need, lingers, hidden }) => ({ id: find, pool, need, lingers, ...(hidden ? { hidden } : {}) })), blanks, aimed, stray, gather, aim }));

/** A place of the game's, as an area: its decks as they stand in this game just now (its own edits and all), each thing with a colour of its own across them all. */
export const areaOf = (game: Game, place: PlaceId): Area => {
  let slot = 0;
  const decks = searchingAt(game, place).map(({ finds, ...dials }): Deck => ({ ...dials, buckets: finds.map((find) => ({ ...find, ...findSays(place, find.id), slot: slot++ })) }));
  return { id: `place:${place}`, name: PLACES[place].name, place, decks };
};

/** The places of the game's that hold anything to find, in any deck. */
export const liveAreas = (game: Game): Area[] => PLACE_IDS.filter((place) => writtenAt(place).some((deck) => deck.finds.length > 0)).map((place) => areaOf(game, place));

const unused = <T>(among: T[], taken: T[]): T | undefined => among.find((one) => !taken.includes(one));
const SLOTS = Array.from({ length: MOST_BUCKETS }, (_, slot) => slot);

/** A new bucket for an area, with the first colour, letter and id it has free in any of its decks: null when it holds as many as it can. */
export const newBucket = (area: Area, dials = BEGINS.scarce): Bucket | null => {
  const all = bucketsOf(area);
  const slot = unused(SLOTS, all.map((b) => b.slot));
  if (slot === undefined) return null;
  const letter = unused([...LETTERS], all.map((b) => b.name)) ?? LETTERS[slot];
  const id = unused(SLOTS.map((n) => `bucket:${n + 1}`), all.map((b) => b.id)) ?? `bucket:${Date.now()}`;
  return { id, name: letter, glyph: "", slot, lingers: false, ...dials };
};

/** A deck as a new area's begins: no things yet, some dead ends, and four stray draws a minute of exploring and the usual of gathering. */
const freshDeck = (id: string): Deck => ({ id, buckets: [], blanks: BEGINS.blanks, aimed: 0, stray: BEGINS.stray, gather: GATHER_DRAWS, aim: "rolled" });

/** Another deck for an area, with a name none of its decks has and one scarce thing in it if there is room for one. */
export const newDeck = (area: Area): Deck => {
  const taken = area.decks.map((deck) => deck.id);
  let n = taken.length + 1;
  while (taken.includes(`${DECK_STEM} ${n}`)) n++;
  const deck = freshDeck(`${DECK_STEM} ${n}`);
  const bucket = newBucket(area);
  return bucket ? { ...deck, buckets: [bucket] } : deck;
};

const freeName = (stem: string, areas: Area[]): string => {
  const taken = areas.map((a) => a.name);
  for (let n = 1; ; n++) if (!taken.includes(`${stem} ${n}`)) return `${stem} ${n}`;
};

/** A new area that is nowhere in the game: one deck, the main one. */
export const newArea = (areas: Area[]): Area => {
  const area: Area = { id: `own:${Date.now()}`, name: freeName("New area", areas), place: null, decks: [freshDeck(MAIN_DECK)] };
  for (const dials of [BEGINS.plenty, BEGINS.scarce]) {
    const bucket = newBucket(area, dials);
    if (bucket) area.decks[0].buckets.push(bucket);
  }
  return area;
};

/** An area of its own with the figures of another: to try things on, with the other left as it is. */
export const copyOf = (area: Area, areas: Area[]): Area => ({ ...area, id: `own:${Date.now()}`, name: freeName(`${area.name}, copy`, areas), place: null, decks: area.decks.map((deck) => ({ ...deck, buckets: deck.buckets.map((b) => ({ ...b })) })) });

/** A number someone has typed, as a whole number within what a dial may be. */
export const within = (typed: string, least: number, most: number): number => Math.max(least, Math.min(most, Math.floor(Number(typed)) || 0));

/** The figures of an area, set down to be copied out: what a place in the game's code would be given. */
export const figuresOf = (area: Area): string =>
  JSON.stringify({ name: area.name, decks: Object.fromEntries(area.decks.map((deck) => [deck.id, { blanks: deck.blanks, stray: deck.stray, aimed: deck.aimed, aim: deck.aim, gather: deck.gather, finds: deck.buckets.map(({ name, pool, need, lingers }) => ({ name, pool, need, lingers })) }])) });

const KEPT = rememberedText("manor3d.odds.areas");
const isCount = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0;
const isAim = (aim: unknown): aim is Deck["aim"] => aim === "rolled" || aim === "nearest";
const isBucket = (b: unknown): b is Bucket => {
  const one = b as Partial<Bucket> | null;
  return typeof one === "object" && one !== null && typeof one.id === "string" && typeof one.name === "string" && typeof one.glyph === "string" && isCount(one.slot) && one.slot < MOST_BUCKETS && isCount(one.pool) && isCount(one.need) && typeof one.lingers === "boolean";
};
const isDeck = (d: unknown): d is Deck => {
  const one = d as Partial<Deck> | null;
  return typeof one === "object" && one !== null && typeof one.id === "string" && Array.isArray(one.buckets) && one.buckets.every(isBucket) && isCount(one.blanks) && isCount(one.aimed) && isCount(one.stray) && isCount(one.gather) && isAim(one.aim);
};
const isArea = (a: unknown): a is Area => {
  const one = a as Partial<Area> | null;
  return typeof one === "object" && one !== null && typeof one.id === "string" && typeof one.name === "string" && one.place === null && Array.isArray(one.decks) && one.decks.length > 0 && one.decks.every(isDeck) && bucketsOf(one as Area).length <= MOST_BUCKETS;
};
/** An area as it was kept before areas had decks: its buckets and dials were those of its one deck, and gathering made the usual draws a minute. */
type OneDeckArea = { id: string; name: string; place: null; buckets: Bucket[]; blanks: number; aimed: number; stray: number; aim: Deck["aim"] };
const asDecked = (kept: unknown): unknown => {
  const one = kept as Partial<OneDeckArea> | null;
  if (typeof one !== "object" || one === null || "decks" in one) return kept;
  const { id, name, place, buckets, blanks, aimed, stray, aim } = one;
  return { id, name, place, decks: [{ id: MAIN_DECK, buckets, blanks, aimed, stray, aim, gather: GATHER_DRAWS }] };
};

/** The areas of their own, kept in this browser from one visit to the next. One kept before areas had decks is read as an area of one deck; what is kept and is no longer an area is let go. */
export const keptAreas = {
  get: (): Area[] => {
    try {
      const kept: unknown = JSON.parse(KEPT.get() ?? "[]");
      return Array.isArray(kept) ? kept.map(asDecked).filter(isArea) : [];
    } catch {
      return [];
    }
  },
  set: (areas: Area[]): void => KEPT.set(JSON.stringify(areas.filter((area) => area.place === null))),
};
