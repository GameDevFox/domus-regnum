import type { Good, GoodId, Recipe, RecipeId, RoomDef, RoomKind } from "../types";

// Goods. Few of them, and each is for something: nothing here is a slightly better copy of
// another. `value` is what one serving adds to its pole at an occasion.
const food = (id: GoodId, name: string, glyph: string, pole: "comfort" | "grace", value: number, price: number, note: string): Good => ({ id, name, glyph, pole, value, price, note, edible: true });
const thing = (id: GoodId, name: string, glyph: string, pole: "comfort" | "grace" | null, value: number, price: number, note: string): Good => ({ id, name, glyph, pole, value, price, note, edible: false });
const luxury = (id: GoodId, name: string, glyph: string, pole: "comfort" | "grace", value: number, price: number, note: string): Good => ({ id, name, glyph, pole, value, price, note, edible: false, luxury: true });

const GOOD_LIST: Good[] = [
  food("bread", "Bread", "🍞", "comfort", 2, 2, "The staple. Quick, cheap, and what the household eats."),
  food("tea", "Tea", "🍵", "grace", 2, 2, "The first courtesy. A patron with a cup in hand waits twice as long."),
  food("scones", "Scones", "🥯", "comfort", 4, 4, "A second plain thing for the table, from provisions alone."),
  food("stew", "Stew", "🍲", "comfort", 6, 5, "Warm and filling. Needs herbs."),
  food("cake", "Seed cake", "🍰", "grace", 6, 6, "A dainty. Needs honey."),
  thing("posy", "Posy", "💐", "grace", 4, 4, "Grown, not cooked: the conservatory makes these with no kitchen at all. Not for eating."),
  food("pie", "Berry pie", "🥧", "comfort", 10, 9, "The showpiece of a plain table. Needs berries."),
  food("cordial", "Cordial", "🍷", "grace", 10, 10, "Still-room work. Needs berries and herbs."),
  food("trifle", "Trifle", "🍮", "grace", 14, 13, "Layers of everything good. Needs berries and honey."),
  food("ham", "Honey ham", "🍖", "comfort", 15, 14, "A joint for the sideboard. Needs honey and herbs."),
  food("salmon", "Salmon", "🥘", "comfort", 20, 18, "A dish worth travelling for. Needs lake fish."),
  thing("perfume", "Scent", "🧴", "grace", 12, 14, "Distilled from posies in the still-room. Offered to guests, never eaten."),
  thing("candle", "Candles", "🕯️", null, 0, 8, "Not served: one box lights a room for an evening, and a candle-lit room doubles its Grace."),
  thing("elixir", "Elixir", "🧪", "grace", 18, 30, "Mends cuts and bruises overnight. Also astonishing in a glass."),
  luxury("chocolates", "Chocolates", "🍫", "grace", 9, 10, "From the confectioner in town. Bought, not made."),
  luxury("oysters", "Oysters", "🦪", "comfort", 14, 14, "Up from the coast on ice. Bought, not made."),
  luxury("champagne", "Champagne", "🍾", "grace", 22, 22, "By the case, from the wine merchant. Bought, not made."),
  luxury("pineapple", "Hothouse pineapple", "🍍", "comfort", 30, 34, "The grandest thing a table can show. Bought, not made."),
  thing("herbs", "Herbs", "🌿", null, 0, 2, "For stew, ham, cordial and elixir. Grown under glass or gathered in the forest."),
  thing("berries", "Berries", "🫐", null, 0, 3, "For pie, trifle and cordial. The forest has them."),
  thing("honey", "Honey", "🍯", null, 0, 4, "For cake, trifle and ham, and its wax for candles. Deeper in the forest."),
  thing("fish", "Lake fish", "🐟", null, 0, 6, "For salmon. The lake has them."),
  thing("salt", "Star salt", "✨", null, 0, 15, "The alchemist's ingredient. Only the caves have it."),
];

export const GOODS: Record<GoodId, Good> = Object.fromEntries(GOOD_LIST.map((g) => [g.id, g]));
export const GOOD_IDS: GoodId[] = GOOD_LIST.map((g) => g.id);
export const LUXURIES: GoodId[] = GOOD_LIST.filter((g) => g.luxury).map((g) => g.id);

const RECIPE_LIST: Recipe[] = [
  { id: "bread", makes: "bread", batch: 4, seconds: 10, coin: 2, needs: {}, room: "kitchen", starter: true },
  { id: "tea", makes: "tea", batch: 4, seconds: 8, coin: 2, needs: {}, room: "kitchen", starter: true },
  { id: "scones", makes: "scones", batch: 4, seconds: 11, coin: 3, needs: {}, room: "kitchen", starter: false },
  { id: "stew", makes: "stew", batch: 4, seconds: 12, coin: 3, needs: { herbs: 1 }, room: "kitchen", starter: false },
  { id: "cake", makes: "cake", batch: 4, seconds: 12, coin: 3, needs: { honey: 1 }, room: "kitchen", starter: false },
  { id: "pie", makes: "pie", batch: 3, seconds: 14, coin: 3, needs: { berries: 2 }, room: "kitchen", starter: false },
  { id: "trifle", makes: "trifle", batch: 3, seconds: 15, coin: 4, needs: { berries: 1, honey: 1 }, room: "kitchen", starter: false },
  { id: "ham", makes: "ham", batch: 3, seconds: 16, coin: 5, needs: { honey: 1, herbs: 1 }, room: "kitchen", starter: false },
  { id: "salmon", makes: "salmon", batch: 3, seconds: 16, coin: 4, needs: { fish: 1 }, room: "kitchen", starter: false },
  { id: "posy", makes: "posy", batch: 3, seconds: 12, coin: 0, needs: {}, room: "conservatory", starter: true },
  { id: "herbs", makes: "herbs", batch: 3, seconds: 10, coin: 0, needs: {}, room: "conservatory", starter: true },
  { id: "cordial", makes: "cordial", batch: 3, seconds: 14, coin: 2, needs: { berries: 1, herbs: 1 }, room: "stillroom", starter: true },
  { id: "perfume", makes: "perfume", batch: 2, seconds: 14, coin: 1, needs: { posy: 2 }, room: "stillroom", starter: true },
  { id: "candle", makes: "candle", batch: 2, seconds: 10, coin: 1, needs: { honey: 1 }, room: "stillroom", starter: true },
  { id: "elixir", makes: "elixir", batch: 1, seconds: 14, coin: 2, needs: { salt: 1, herbs: 1 }, room: "stillroom", starter: true },
];

export const RECIPES: Record<RecipeId, Recipe> = Object.fromEntries(RECIPE_LIST.map((r) => [r.id, r]));
export const RECIPE_IDS: RecipeId[] = RECIPE_LIST.map((r) => r.id);

/** Recipes that can turn up as offers (the rest come with their room). */
export const LEARNABLE: { id: RecipeId; cost: number }[] = [
  { id: "scones", cost: 10 },
  { id: "stew", cost: 14 },
  { id: "cake", cost: 16 },
  { id: "pie", cost: 28 },
  { id: "trifle", cost: 40 },
  { id: "ham", cost: 48 },
  { id: "salmon", cost: 60 },
];

const ROOM_LIST: RoomDef[] = [
  { kind: "closed", name: "Closed wing", glyph: "🚪", role: "none", seats: 0, cost: 0, blurb: "Under dust sheets. Opening a wing adds four rooms." },
  { kind: "empty", name: "Empty room", glyph: "▫️", role: "none", seats: 0, cost: 0, blurb: "Bare boards. It could be anything." },
  { kind: "pantry", name: "Pantry", glyph: "🧺", role: "run", seats: 0, cost: 0, blurb: "Where everything kept is kept. A maid posted here runs goods to wherever they are wanted, by day and during an occasion." },
  { kind: "kitchen", name: "Kitchen", glyph: "🍳", role: "produce", seats: 0, cost: 40, blurb: "Bakes and cooks, one recipe at a time. A second kitchen is a second recipe." },
  { kind: "shop", name: "Shop", glyph: "🛎️", role: "serve", seats: 0, cost: 30, blurb: "Sells to whoever walks in from the street." },
  { kind: "parlour", name: "Parlour", glyph: "🛋️", role: "serve", seats: 3, cost: 30, blurb: "Three seats. A tea room by day; where guests are received at an occasion." },
  { kind: "lab", name: "Laboratory", glyph: "⚗️", role: "research", seats: 0, cost: 0, blurb: "Where the Master works. Time spent here becomes inventions." },
  { kind: "conservatory", name: "Conservatory", glyph: "🪴", role: "produce", seats: 0, cost: 30, blurb: "Grows posies and herbs under glass, with no provisions to buy." },
  { kind: "stillroom", name: "Still-room", glyph: "🫙", role: "produce", seats: 0, cost: 45, blurb: "Cordials, scent, candles and elixirs: what the forest, the garden and the caves are for." },
  { kind: "dining", name: "Dining room", glyph: "🍽️", role: "serve", seats: 6, cost: 60, blurb: "Six seats. Twice the parlour, and it needs twice the service." },
  { kind: "music", name: "Music room", glyph: "🎻", role: "perform", seats: 0, cost: 55, blurb: "While someone plays here, every serving of Grace in the house counts double." },
  { kind: "bath", name: "Bath-house", glyph: "🛁", role: "serve", seats: 1, cost: 40, blurb: "Bathers pay well by day, each bath drawn by hand. At an occasion, while someone keeps the water hot, Comfort counts double through the whole house." },
];

export const ROOM_DEFS: Record<RoomKind, RoomDef> = Object.fromEntries(ROOM_LIST.map((r) => [r.kind, r])) as Record<RoomKind, RoomDef>;

/** Rooms an empty slot can be fitted out as. */
export const FITTABLE: RoomKind[] = ["kitchen", "shop", "parlour", "conservatory", "stillroom", "dining", "music", "bath"];

/** Reception rooms seat patrons and guests. */
export const isReception = (kind: RoomKind): boolean => kind === "parlour" || kind === "dining";

/** Walk-in customers per second for each good on sale, before renown. Dear things have fewer takers. */
export const POPULARITY: Record<GoodId, number> = {
  bread: 0.16, tea: 0.14, scones: 0.11, stew: 0.09, cake: 0.09, posy: 0.07, pie: 0.06, cordial: 0.05, trifle: 0.045, ham: 0.04,
  salmon: 0.035, perfume: 0.035, candle: 0.03, elixir: 0.015, chocolates: 0.03, oysters: 0.02, champagne: 0.015, pineapple: 0.008,
  herbs: 0.015, berries: 0.015, honey: 0.015, fish: 0.012, salt: 0.008,
};

export const recipesFor = (kind: RoomKind, known: RecipeId[]): Recipe[] => known.map((id) => RECIPES[id]).filter((r) => r.room === kind);
