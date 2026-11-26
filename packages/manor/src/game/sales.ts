import { THINGS, THING_IDS } from "./country";
import type { ThingId } from "./country";
import { CROPS } from "./garden";
import type { CropId } from "./garden";
import type { Game } from "./types";
import { SHOPS, knowsShop } from "./wares";
import type { GoodId, Shop } from "./wares";

// Selling what the house has too much of, at a stall in town that deals in it (the author's,
// 2026-11-16: "if you [have] excess goods, like berries, you can go to a certain stall that
// actually deals in that product and sell them … you need to have already discovered the stall
// that will buy those goods from you before you can sell to them"). Which stall buys what is
// the stall's (`buys`, wares.ts); what each thing fetches is here. The going and the coming home
// are an outing like any other: sent from the house (`sellInTown`, outing-send.ts) she takes one
// kind of thing, as many lots as her basket holds; told in town (outing-tell.ts) she sells all
// she carries of a kind. The coin is the house's when she is in at the door.

const isThing = (good: GoodId): good is ThingId => (THING_IDS as GoodId[]).includes(good);

/** A thing that can be sold, as it is shown: its name and its picture. */
export const goodOf = (good: GoodId): { name: string; glyph: string } => (isThing(good) ? THINGS[good] : CROPS[good as CropId]);

/** What a lot of something gathered fetches at its stall, in coin. Less than it is worth baked: two lots of berries go into pies that sell for twenty-seven. */
const THING_PRICES: Record<ThingId, number> = { berries: 3, herbs: 5 };

/**
 * What one of something fetches at its stall. Of what is grown, the longer it is in the ground
 * and the fewer a square bears, the more one of it is worth: the watered days it takes, shared
 * among what a square bears, and never less than one coin.
 */
export const priceOf = (good: GoodId): number => (isThing(good) ? THING_PRICES[good] : Math.max(1, Math.round(CROPS[good as CropId].days / CROPS[good as CropId].bears)));

/** The stall that deals in a thing, whether or not the house has found it; null if nobody buys it. */
export const stallFor = (good: GoodId): Shop | null => SHOPS.find((shop) => shop.buys.includes(good)) ?? null;

/** The stalls the house has found that buy anything at all. */
export const stallsKnown = (game: Game): Shop[] => SHOPS.filter((shop) => shop.buys.length > 0 && knowsShop(game, shop.id));

/** What the house could sell: everything a found stall buys, with how many of it the house has and what one fetches. What it has none of is among them, so that it is seen what the stall deals in. */
export const goodsToSell = (game: Game): { good: GoodId; stall: Shop; have: number; price: number }[] =>
  stallsKnown(game).flatMap((stall) => stall.buys.map((good) => ({ good, stall, have: game.stock[good], price: priceOf(good) })));
