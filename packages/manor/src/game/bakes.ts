import { THING_IDS } from "./country";
import type { Basket, ThingId } from "./country";
import { LOAF_PRICE, LOAVES_PER_SACK, PIES_PER_BATCH, PIE_BERRIES, PIE_PRICE } from "./tuning";
import type { Game } from "./types";

// What the kitchen bakes for the shop. Every batch is a sack of flour, kneaded and baked; what
// comes out of the oven depends on what else went in. A baker makes the best thing the pantry
// has the makings of, and a customer takes the best thing on the shelf: so what is gathered out
// of doors is turned into the dearer thing without anyone being told to.
//
// The pie is the 2D game's (src/sim/content/house.ts): two lots of berries to a batch of three,
// at nine coin a pie.

export type BakeId = "bread" | "pie";

export type Bake = {
  name: string;
  glyph: string;
  /** How many a batch makes, and what one sells for. */
  batch: number;
  /** What a batch is made of, counted: "4 loaves". */
  units: string;
  price: number;
  /** What a batch takes from the pantry beside its sack of flour. */
  needs: Basket;
};

export const BAKES: Record<BakeId, Bake> = {
  bread: { name: "Bread", glyph: "🍞", batch: LOAVES_PER_SACK, units: "loaves", price: LOAF_PRICE, needs: {} },
  pie: { name: "Berry pie", glyph: "🥧", batch: PIES_PER_BATCH, units: "pies", price: PIE_PRICE, needs: { berries: PIE_BERRIES } },
};

/** From the dearest down: the order a baker would rather make them in, and a customer would rather have them. */
export const BAKE_IDS: BakeId[] = ["pie", "bread"];

/** The things a batch of something takes beside flour, each with how many lots. */
export const needsOf = (bake: BakeId): [ThingId, number][] => THING_IDS.flatMap((thing): [ThingId, number][] => (BAKES[bake].needs[thing] ? [[thing, BAKES[bake].needs[thing] ?? 0]] : []));

/** Whether the pantry has what a batch of something takes, beside the flour. */
export const hasMakings = (game: Game, bake: BakeId): boolean => needsOf(bake).every(([thing, lots]) => game.stock[thing] >= lots);

/** What a baker starting a batch now would make: the best thing there are the makings of. Bread wants nothing but flour. */
export const bestToBake = (game: Game): BakeId => BAKE_IDS.find((bake) => hasMakings(game, bake)) ?? "bread";

/** How many things are on the shop's shelf, of every kind. */
export const onShelf = (game: Game): number => BAKE_IDS.reduce((sum, bake) => sum + game.shelf[bake], 0);

/** The best thing on the shop's shelf, if there is anything on it: what the next customer is sold. */
export const bestOnShelf = (game: Game): BakeId | null => BAKE_IDS.find((bake) => game.shelf[bake] >= 1) ?? null;
