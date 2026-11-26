import type { PlaceId, ThingId } from "./country";
import { CROP_IDS } from "./garden";
import type { CropId } from "./garden";
import { offered, study } from "./lab";
import { ERRAND_SACKS, FLOUR_COST, TREATISE_SHARE } from "./tuning";
import type { Game } from "./types";

// What is sold in town, shop by shop. A purchase in town buys one ware: flour at the miller's,
// as it always did; a book at the book shop; something to wear at the clothes shop. (The
// author, 2026-11-16: "Add book store (for intel and research) and clothing store to town to
// buy gloves, boots, shoes, clothings and accesories which are needed for alchemy recipes
// (boots that walk faster, gloves that carry more, glasses that make gathering easier, etc.)",
// and "Just start with a generic set of clothing items for now. One of each.")
//
// A book does what it is for the moment it is in the house: the almanac teaches the garden a
// crop (intel), the treatise adds to the Master's measure (research). What is worn is plain so
// far, and only kept: nothing is made of it yet.

export type ShopId = "miller" | "greengrocer" | "books" | "herbalist" | "clothes";
/** What the house has that can be sold: what is gathered out of doors, and what is grown. */
export type GoodId = ThingId | CropId;
/** What is worn: one plain thing of each kind. */
export type ClothingId = "gloves" | "boots" | "shoes" | "clothing" | "glasses";
export type WareId = "flour" | "almanac" | "treatise" | ClothingId;

// No shop is known when a game begins: the town is on the map, and what is in it is found by
// exploring it, in no set order, as anything a place holds is (discovery.ts) (the author's, 2026-11-16: "Can we
// make each shop so that you have to discover it first by exploring? The town still shows up,
// but when you begin the game, you're not sure what shops are actually there, so each shop kind
// of acts like a different activity that you can do, like collecting berries or whatever").

// Some of what is found in the town does not sell to the house but buys of it: a stall that
// deals in a kind of thing takes what the house has too much of (the author's, 2026-11-16: "if
// you [have] excess goods, like berries, you can go to a certain stall that actually deals in
// that product and sell them. Basically, you need to have already discovered the stall that will
// buy those goods from you before you can sell to them"). Selling is sales.ts.

/**
 * A shop: what it is, what is said of it once it is found, what it buys of the house, if it buys;
 * and how it is found by exploring the town (discovery.ts): how many points of it there are among
 * the town's, any one of which finds it. The more points, the sooner as a rule: the miller's is on
 * the main street, and the herbalist's stall is the one tucked away. (Which is which is mine to
 * begin with, and the author's to say.)
 */
export type Shop = Readonly<{ id: ShopId; glyph: string; name: string; says: string; pool: number; need: number; /** Which of the town's decks its points are in: the main one, unless it says. */ deck?: string; buys: readonly GoodId[] }>;
/** As the code has them, and nothing writes into them: a game's own edits of the dials are the game's (discovery.ts, `retune`). */
export const SHOPS: readonly Shop[] = [
  { id: "miller", glyph: "🌾", name: "The miller's", says: `Flour is bought here, ${ERRAND_SACKS} sacks at a time`, pool: 6, need: 1, buys: [] },
  // (Wheat is flour once it is in the house, and is not sold as wheat.)
  { id: "greengrocer", glyph: "🥬", name: "The greengrocer's stall", says: "Berries are sold here, and what the garden grows", pool: 4, need: 1, buys: ["berries", ...CROP_IDS.filter((crop) => crop !== "wheat")] },
  { id: "books", glyph: "📚", name: "The book shop", says: "Books are sold here", pool: 3, need: 1, buys: [] },
  { id: "herbalist", glyph: "🌿", name: "The herbalist's stall", says: "Herbs are sold here", pool: 1, need: 1, buys: ["herbs"] },
  { id: "clothes", glyph: "👗", name: "The clothes shop", says: "Things to wear are sold here", pool: 3, need: 1, buys: [] },
];
export const SHOP_IDS: ShopId[] = SHOPS.map((s) => s.id);
/** Where the shops are: the one place exploring finds them. */
export const SHOPS_AT: PlaceId = "town";

export const knowsShop = (game: Game, shop: ShopId): boolean => game.shops.includes(shop);
/** The shops the house has found, in the order they stand in the town. */
export const shopsKnown = (game: Game): Shop[] => SHOPS.filter((s) => knowsShop(game, s.id));
/** The shops the house has not found yet. */
export const shopsLeft = (game: Game): Shop[] => SHOPS.filter((s) => !knowsShop(game, s.id));

/** A ware: where it is sold, what it is, what an errand for it costs, and how many of it that errand brings. */
export type Ware = { id: WareId; shop: ShopId; glyph: string; name: string; /** What it is for, in a sentence. */ says: string; price: number; lot: number };

const WARE_LIST: Ware[] = [
  { id: "flour", shop: "miller", glyph: "🌾", name: "Flour", says: "Every batch the kitchen bakes takes a sack of it", price: ERRAND_SACKS * FLOUR_COST, lot: ERRAND_SACKS },
  { id: "almanac", shop: "books", glyph: "📗", name: "A gardener's almanac", says: "Read, it teaches the garden a crop it did not know", price: 25, lot: 1 },
  { id: "treatise", shop: "books", glyph: "📕", name: "A treatise", says: "Read, it brings the Master's next invention nearer", price: 40, lot: 1 },
  { id: "gloves", shop: "clothes", glyph: "🧤", name: "Gloves", says: "A plain pair: nothing is made of them yet", price: 20, lot: 1 },
  { id: "boots", shop: "clothes", glyph: "🥾", name: "Boots", says: "A plain pair: nothing is made of them yet", price: 30, lot: 1 },
  { id: "shoes", shop: "clothes", glyph: "👞", name: "Shoes", says: "A plain pair: nothing is made of them yet", price: 25, lot: 1 },
  { id: "clothing", shop: "clothes", glyph: "👗", name: "Clothing", says: "A plain suit of it: nothing is made of it yet", price: 40, lot: 1 },
  { id: "glasses", shop: "clothes", glyph: "👓", name: "Glasses", says: "A plain pair: nothing is made of them yet", price: 35, lot: 1 },
];
export const WARE_IDS: WareId[] = WARE_LIST.map((w) => w.id);
export const WARES = Object.fromEntries(WARE_LIST.map((w) => [w.id, w])) as Record<WareId, Ware>;
export const CLOTHING_IDS: ClothingId[] = ["gloves", "boots", "shoes", "clothing", "glasses"];

export const waresOf = (shop: ShopId): Ware[] => WARE_LIST.filter((w) => w.shop === shop);

export const newWardrobe = (): Record<ClothingId, number> => ({ gloves: 0, boots: 0, shoes: 0, clothing: 0, glasses: 0 });

/** The crop the next almanac would teach: the first the garden does not know, or none. */
export const nextCrop = (game: Game): CropId | null => CROP_IDS.find((crop) => !game.garden.known.includes(crop)) ?? null;

/** Whether a ware would be of no use to the house just now: an almanac with every crop known, a treatise with the measure full or nothing left to invent. */
export const needless = (game: Game, ware: WareId): boolean => (ware === "almanac" ? nextCrop(game) === null : ware === "treatise" ? game.lab.ready || offered(game).length === 0 : false);

const isClothing = (ware: WareId): ware is ClothingId => (CLOTHING_IDS as WareId[]).includes(ware);

/** A ware is in the house: flour to bake with, a book read, something to wear put by. */
export const takeIn = (game: Game, ware: WareId, load: number): void => {
  if (ware === "flour") game.flour += load;
  else if (ware === "almanac") {
    const crop = nextCrop(game);
    if (crop) game.garden.known.push(crop);
  } else if (ware === "treatise") study(game, TREATISE_SHARE);
  else if (isClothing(ware)) game.wardrobe[ware] += load;
};
