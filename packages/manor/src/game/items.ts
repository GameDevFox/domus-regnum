import { BAKES } from "./bakes";
import { PLACES, THINGS } from "./country";
import { CURIOS, curioFound } from "./curios";
import { CROPS } from "./garden";
import type { Game } from "./types";
import { SHOPS, WARES, knowsShop, newWardrobe } from "./wares";

// Everything the house can have a number of, in one list (the author's list, 2026-11-16:
// "Clothing items not showing up in inventory or intel. Redesign a system where it's impossible
// to have an item in game that DOESN'T show up on the intel screen, or show up in the inventory
// menu"). The pattern is the item registry of any game with an inventory: one table that says
// what each thing is, and everything that shows things reads the table.
//
// The inventory (the ledger at the top of the panel) is this list and nothing else, and the
// intel menu's page of things is made from it; so what is on the list is in both, and nothing
// is in either by being written there by hand. And nothing the house can hold can be left off
// the list:
// - `ItemId` is not written out: it is the keys of every store of the game's that counts
//   things. A new thing in one of them (another thing to wear, another crop) is an `ItemId`
//   from that moment, and `ITEMS` does not compile until it has an entry.
// - Each kind's entries are made from the table that defines the kind, which the type checker
//   holds to be whole (`each`).
// - A store of another kind altogether is caught by a test (items.test.ts), which goes over a
//   game and fails for any record of numbers it has that is neither on the list nor named there
//   as something that is not things held.

/** Everything the house can have a number of: coin, flour, and the keys of each of the game's stores. */
export type ItemId = "coin" | "flour" | keyof Game["shelf"] | keyof Game["stock"] | keyof Game["wardrobe"] | Game["curios"][number];

export type Item = {
  id: ItemId;
  name: string;
  glyph: string;
  /** What a number of it is, for the inventory: "Sacks of flour in the pantry". */
  held: string;
  /** How many the house has. */
  count: (game: Game) => number;
  /** Whether it is on the house's books: the inventory shows it from then. Always, where this is left out. */
  shown?: (game: Game) => boolean;
  /**
   * Where the intel menu speaks of it. A crop is spoken of on the page of crops, and what the
   * kitchen bakes on the page of recipes, each by the entry of its own kind and of the same id.
   * Anything else is a thing, and its entry on the page of things is made from this: something
   * gathered out of doors, something come upon (hidden until it is), or something plain, for
   * which what is said of it, and whether the house knows of it yet, are said here.
   */
  intel: { kind: "crop" } | { kind: "recipe" } | { kind: "thing"; is: "gathered" } | { kind: "thing"; is: "curio" } | { kind: "thing"; is: "plain"; says: (game: Game) => string[]; known: (game: Game) => boolean };
};

/** An entry for each of a kind, from the table that defines the kind: whole, because the table is. */
const each = <K extends ItemId>(table: Record<K, unknown>, make: (id: K) => Omit<Item, "id">): Record<K, Item> => Object.fromEntries((Object.keys(table) as K[]).map((id) => [id, { id, ...make(id) }])) as unknown as Record<K, Item>;

const lower = (name: string): string => name.charAt(0).toLowerCase() + name.slice(1);
/** What a number of each thing the kitchen bakes is, on the shop's shelf. */
const ON_THE_SHELF: Record<keyof Game["shelf"], string> = { bread: "Loaves on the shop's shelf", pie: "Berry pies on the shop's shelf" };

export const ITEMS: Record<ItemId, Item> = {
  coin: { id: "coin", name: "Coin", glyph: "🪙", held: "Coin", count: (g) => g.coin, intel: { kind: "thing", is: "plain", known: () => true, says: () => ["Taken at the shop's counter for every loaf and pie, and at a stall in town for what the house has too much of", "Spent on flour, and in the shops in town"] } },
  // Flour is known from the first morning: the house is a bakery.
  flour: { id: "flour", name: "Flour", glyph: "🌾", held: "Sacks of flour in the pantry", count: (g) => g.flour, intel: { kind: "thing", is: "plain", known: () => true, says: () => ["Bought in town, or brought by the carter", "Every batch the kitchen bakes takes a sack of it"] } },
  // What the kitchen bakes, on the shop's shelf: bread from the first, anything else once there has been some.
  ...each(BAKES, (id) => ({ name: BAKES[id].name, glyph: BAKES[id].glyph, held: ON_THE_SHELF[id], count: (g) => g.shelf[id], shown: id === "bread" ? undefined : (g) => g.shelf[id] > 0, intel: { kind: "recipe" } })),
  // What is gathered out of doors: on the books once the house has met it.
  ...each(THINGS, (id) => ({ name: THINGS[id].name, glyph: THINGS[id].glyph, held: `Lots of ${THINGS[id].name.toLowerCase()} in the pantry`, count: (g) => g.stock[id], shown: (g) => g.stock[id] > 0 || Object.values(g.finds).some((things) => things?.includes(id)), intel: { kind: "thing", is: "gathered" } })),
  // What the garden bears: on the books once some of it has been brought in.
  ...each(CROPS, (id) => ({ name: CROPS[id].name, glyph: CROPS[id].glyph, held: `${CROPS[id].name} in the pantry`, count: (g) => g.stock[id], shown: (g) => g.stock[id] > 0, intel: { kind: "crop" } })),
  // What there is to wear: on the books once the house has some, and known of once the shop that sells it has been found.
  ...each(newWardrobe(), (id) => {
    const shop = SHOPS.find((s) => s.id === WARES[id].shop);
    return {
      name: WARES[id].name,
      glyph: WARES[id].glyph,
      held: `${WARES[id].name} put by`,
      count: (g) => g.wardrobe[id],
      shown: (g) => g.wardrobe[id] > 0,
      intel: { kind: "thing", is: "plain", known: (g) => g.wardrobe[id] > 0 || knowsShop(g, WARES[id].shop), says: (g) => [`Bought at ${lower(shop?.name ?? "a shop")} in town, for ${WARES[id].price} coin`, WARES[id].says, g.wardrobe[id] > 0 ? `The house has ${g.wardrobe[id]}` : "The house has none"] },
    };
  }),
  // What is come upon out of doors: there is one of each, and it is the house's once it is home.
  ...each(CURIOS, (id) => ({ name: CURIOS[id].name, glyph: CURIOS[id].glyph, held: `${CURIOS[id].name}, come upon at ${PLACES[CURIOS[id].place].name.toLowerCase()}`, count: (g) => (g.curios.includes(id) ? 1 : 0), shown: (g) => curioFound(g, id), intel: { kind: "thing", is: "curio" } })),
};

/** Every item, in the order the inventory shows them. */
export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];
