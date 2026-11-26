import { dayOf } from "./clock";
import { HARVEST_SECONDS, SOW_SECONDS, WATER_SECONDS } from "./tuning";
import type { Game } from "./types";

// The kitchen garden behind the house: four dug plots, each of six squares. Each square can be
// given a crop of its own (the author's asking, 2026-11-14: "multiple planting squares that can
// have a different crop planted in them"); what is sown grows a day's worth each night it has
// been watered that day, is ripe after so many days, and is then brought in to the pantry. Slow, on the premises, and little to see to but what to
// plant. (The author's premise: `packages/domus/docs/design/22-reset-direction.md`, "The garden
// plot — an easy, early unlock".)
//
// The list of crops is Rune Factory 4's, at the author's asking ("taking inspiration from Rune
// Factory as far as the yield and the number of days for each crop to grow"), and its figures
// were where these began (the Ranch Story wiki's "Farming (Rune Factory 4)"). They are not its
// figures now: the author asked that each be moved, "inspired by it" and not copied, with how
// the plants really grow to say which way. So a crop that is quick in a real garden is quick
// here and a slow one slow, with the slowest drawn in so that the longest is one season; a
// crop bears again only if the real plant goes on bearing; and a square bears more of what a
// real plant gives many of. Beside each is what was gone by. Turnips are left out at the
// author's word; so are the crops with no picture of their own (spinach, bok choy, radish,
// leek) and the one that is not a real plant.

export type CropId = "wheat" | "potato" | "cabbage" | "cucumber" | "strawberry" | "tomato" | "corn" | "pumpkin" | "eggplant" | "pineapple" | "onion" | "yam" | "carrot" | "pepper";

export type Crop = {
  name: string;
  glyph: string;
  /** Watered days from sowing until it is ripe. */
  days: number;
  /** Watered days until it bears again, once picked; null for a crop that is pulled when it is picked. */
  again: number | null;
  /** How many come of one harvest of one square of a plot. */
  bears: number;
  /** What a harvest of it is once it is in the house, where that is not itself: wheat is flour, by the sack, the mill being left out for now. */
  becomes?: "flour";
};

export const CROPS: Record<CropId, Crop> = {
  // The first crop, and the quick one (the author's, 2026-11-16: "I want wheat to kind of be the turnip of this game … the starting item
  // of this game", with "a nice short turnaround, kind of like the turnips in Rune Factory, even if it isn't realistic. And we can maybe
  // explain it away by saying the ground is particularly fertile"; and of what it is for: "another way to get cheap and easy wheat for
  // the early game … really quick, reliable money"). Real wheat is four months in the ground from a spring sowing, ten from an autumn
  // one, and a plot this size would give a loaf's worth: here it is three days, and a square gives two sacks of flour.
  wheat: { name: "Wheat", glyph: "🌾", days: 3, again: null, bears: 2, becomes: "flour" },
  // Ten weeks to four months in the ground, and several tubers to a plant.
  potato: { name: "Potatoes", glyph: "🥔", days: 9, again: null, bears: 5 },
  // Ten to fourteen weeks, and one head to a plant.
  cabbage: { name: "Cabbages", glyph: "🥬", days: 9, again: null, bears: 2 },
  // The quickest of them, seven to ten weeks from seed; then picked every two or three days.
  cucumber: { name: "Cucumbers", glyph: "🥒", days: 6, again: 3, bears: 4 },
  // Three months to a first picking at the soonest, a year for some; then a handful every few days.
  strawberry: { name: "Strawberries", glyph: "🍓", days: 14, again: 3, bears: 4 },
  // Two or three months from planting out, and then it goes on ripening, a great many to a plant.
  tomato: { name: "Tomatoes", glyph: "🍅", days: 9, again: 3, bears: 4 },
  // Two to three months, an ear or two to a stalk, and that is all the stalk gives.
  corn: { name: "Corn", glyph: "🌽", days: 10, again: null, bears: 2 },
  // Three to four months, and a vine sets its few fruit once.
  pumpkin: { name: "Pumpkins", glyph: "🎃", days: 11, again: null, bears: 2 },
  // Slow from seed, three or four months; then it bears for weeks.
  eggplant: { name: "Aubergines", glyph: "🍆", days: 11, again: 4, bears: 3 },
  // A year and a half to two years, one fruit to a plant, and another from the same plant a year on: here, a whole season.
  pineapple: { name: "Pineapples", glyph: "🍍", days: 30, again: 12, bears: 1 },
  // Three to four months from sets, a bulb to a plant.
  onion: { name: "Onions", glyph: "🧅", days: 12, again: null, bears: 4 },
  // The true yam is eight to eleven months in the ground, dug once, and heavy.
  yam: { name: "Yams", glyph: "🍠", days: 20, again: null, bears: 6 },
  // Seven to eleven weeks, pulled by the bunch.
  carrot: { name: "Carrots", glyph: "🥕", days: 8, again: null, bears: 4 },
  // Two or three months from planting out, and then it goes on bearing.
  pepper: { name: "Green peppers", glyph: "🫑", days: 8, again: 3, bears: 4 },
};

/** Where the figures began: Rune Factory 4's, as the Ranch Story wiki gives them. Kept to show that none is copied, and for whoever tunes them next. */
// (Wheat is not of that list: its figures are this game's own.)
export const RUNE_FACTORY: Record<Exclude<CropId, "wheat">, Pick<Crop, "days" | "again" | "bears">> = {
  potato: { days: 7, again: null, bears: 3 },
  cabbage: { days: 8, again: null, bears: 3 },
  cucumber: { days: 5, again: 2, bears: 5 },
  strawberry: { days: 16, again: 4, bears: 6 },
  tomato: { days: 10, again: 4, bears: 3 },
  corn: { days: 14, again: 3, bears: 1 },
  pumpkin: { days: 7, again: 3, bears: 3 },
  eggplant: { days: 9, again: 5, bears: 4 },
  pineapple: { days: 28, again: 6, bears: 3 },
  onion: { days: 18, again: null, bears: 5 },
  yam: { days: 6, again: 3, bears: 5 },
  carrot: { days: 10, again: null, bears: 3 },
  pepper: { days: 9, again: 4, bears: 5 },
};

export const CROP_IDS = Object.keys(CROPS) as CropId[];

/** What one harvest of one square of a crop bears, in words: so many of itself, or of what it is once it is in the house. */
export const bearsSays = (crop: CropId): string => `${CROPS[crop].bears}${CROPS[crop].becomes === "flour" ? ` sack${CROPS[crop].bears === 1 ? "" : "s"} of flour` : ""}`;

/**
 * The crop a new game knows how to grow: wheat, this game's turnip (the author's, 2026-11-16: "I want wheat to kind of be the
 * starting item of this game"). Until then it was potatoes ("Let's keep potatoes as the initial default crop", 2026-11-14, said of
 * not taking the turnip, which is those other games' own); they are the first thing an almanac teaches now.
 */
export const FIRST_CROP: CropId = "wheat";

/** How many plots there are: the four that are dug behind the house. And how each is laid out in squares: so many across and so many deep, each sown with a crop of its own. */
export const PLOTS = 4;
export const SQUARES_ACROSS = 3;
export const SQUARES_DEEP = 2;
export const SQUARES = SQUARES_ACROSS * SQUARES_DEEP;

/** One square of a plot. */
export type Square = {
  /** What is growing in it, if anything; and what is to be sown in it when it is next empty, if anything. */
  crop: CropId | null;
  wanted: CropId | null;
  /** How many watered days it has grown; and whether it has been watered today. */
  grown: number;
  watered: boolean;
};

/** A plot: its squares, row by row from the north-west. */
export type Plot = { squares: Square[] };

/** A square seen to: what a gardener can do at it. */
export type Tending = "harvest" | "sow" | "water";

export type Garden = {
  plots: Plot[];
  /** The crops the house knows how to grow. */
  known: CropId[];
  /** The day the squares last grew on: they grow once as each new day begins. */
  day: number;
};

const bare = (): Square => ({ crop: null, wanted: null, grown: 0, watered: false });

export const newGarden = (clock: number): Garden => ({ plots: Array.from({ length: PLOTS }, () => ({ squares: Array.from({ length: SQUARES }, bare) })), known: [FIRST_CROP], day: dayOf(clock) });

/** Every square of the garden, with where it is: plot by plot, and in each from the north-west. */
export const everySquare = (game: Game): { plot: number; square: number; bed: Square }[] => game.garden.plots.flatMap((plot, p) => plot.squares.map((bed, s) => ({ plot: p, square: s, bed })));

/** Whether what is in a square is ripe. */
export const isRipe = (bed: Square): boolean => bed.crop !== null && bed.grown >= CROPS[bed.crop].days;

/** How many more watered days until a square is ripe; nothing, for an empty one. */
export const daysLeft = (bed: Square): number | null => (bed.crop === null ? null : Math.max(0, CROPS[bed.crop].days - bed.grown));

/** Say what is to be sown in a square when it is next empty: a crop the house knows, or nothing. What is growing there now is left to ripen. */
export const want = (game: Game, plot: number, square: number, crop: CropId | null): boolean => {
  const bed = game.garden.plots[plot]?.squares[square];
  if (!bed || (crop !== null && !game.garden.known.includes(crop))) return false;
  bed.wanted = crop;
  return true;
};

/** The same for every square of a plot at once. */
export const wantAll = (game: Game, plot: number, crop: CropId | null): boolean => {
  const squares = game.garden.plots[plot]?.squares ?? [];
  return squares.length > 0 && squares.map((_, square) => want(game, plot, square, crop)).every(Boolean);
};

/** What a square wants done to it now, if anything: picking when it is ripe, sowing when it is empty and something is wanted, and otherwise watering once a day while something grows. */
export const tendingOf = (bed: Square): Tending | null => {
  if (isRipe(bed)) return "harvest";
  if (bed.crop === null) return bed.wanted !== null ? "sow" : null;
  return bed.watered ? null : "water";
};

/** How long each takes at one square, in seconds. */
export const TENDING_SECONDS: Record<Tending, number> = { harvest: HARVEST_SECONDS, sow: SOW_SECONDS, water: WATER_SECONDS };

/**
 * Do it. Sowing puts in what is wanted. Watering counts for today. Picking gives what the crop
 * bears, and then the crop bears again if it is one that does and is still what is wanted
 * there; otherwise the square is empty. What was picked is returned: nothing, for the rest.
 */
export const tend = (game: Game, plot: number, square: number, what: Tending): { crop: CropId; count: number } | null => {
  const bed = game.garden.plots[plot]?.squares[square];
  if (!bed || tendingOf(bed) !== what) return null;
  if (what === "sow") Object.assign(bed, { crop: bed.wanted, grown: 0, watered: false });
  else if (what === "water") bed.watered = true;
  if (what !== "harvest" || bed.crop === null) return null;
  const crop = bed.crop;
  const { again, days, bears } = CROPS[crop];
  if (again !== null && bed.wanted === crop) bed.grown = days - again;
  else Object.assign(bed, { crop: null, grown: 0, watered: false });
  return { crop, count: bears };
};

/** As each new day begins, what was watered the day before has grown a day's worth; and nothing has been watered yet today. */
export const stepGarden = (game: Game): void => {
  const today = dayOf(game.clock);
  for (; game.garden.day < today; game.garden.day++) {
    for (const { bed } of everySquare(game)) {
      // (What is ripe is not watered, and so waits as it is.)
      if (bed.crop !== null && bed.watered) bed.grown += 1;
      bed.watered = false;
    }
  }
};
