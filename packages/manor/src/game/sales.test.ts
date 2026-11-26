import { describe, expect, it } from "vitest";

import { CROPS, CROP_IDS } from "./garden";
import { doingsAt, outingOf } from "./outing";
import { lotsToSell, sellInTown, whyNotSell } from "./outing-send";
import { outingStatus } from "./outing-status";
import { goodsToSell, priceOf, stallFor, stallsKnown } from "./sales";
import { gameAt, person, run, until } from "./test-kit";
import { BASKET_HOLDS, ERRAND_MINUTES, HOUR, SHOP_OPENS } from "./tuning";
import type { Game } from "./types";

// Selling what the house has too much of, at a stall in town that deals in it (sales.ts).

/** A game with the town's shops found, nobody at the shop at home (so that the only coin that comes in is what is fetched in town), and some things in the pantry. */
const stocked = (): Game => {
  const game = gameAt(SHOP_OPENS);
  for (const id of game.household) if (game.posts[id] === "shop") delete game.posts[id];
  game.shelf.bread = 0;
  game.stock.berries = 5;
  game.stock.herbs = 20;
  game.stock.potato = 3;
  return game;
};
const home = (game: Game, id: string): void => until(game, () => outingOf(game, id) === undefined, 6 * HOUR);

describe("what a stall buys", () => {
  it("is what it deals in: berries and what the garden grows at the greengrocer's, herbs at the herbalist's; and wheat nowhere, being flour", () => {
    expect(stallFor("berries")?.id).toBe("greengrocer");
    expect(stallFor("herbs")?.id).toBe("herbalist");
    for (const crop of CROP_IDS.filter((c) => c !== "wheat")) expect(stallFor(crop)?.id, crop).toBe("greengrocer");
    expect(stallFor("wheat")).toBeNull();
  });

  it("fetches a fixed price: gathered things their own, and what is grown the more for being long in the ground and few to a square", () => {
    expect(priceOf("berries")).toBe(3);
    expect(priceOf("herbs")).toBe(5);
    expect(priceOf("potato")).toBe(Math.round(CROPS.potato.days / CROPS.potato.bears));
    expect(priceOf("pineapple")).toBeGreaterThan(priceOf("yam"));
    expect(priceOf("yam")).toBeGreaterThan(priceOf("cucumber"));
    for (const crop of CROP_IDS) expect(priceOf(crop)).toBeGreaterThanOrEqual(1);
  });
});

describe("selling in town", () => {
  it("wants the stall that deals in the thing to have been found: until then nobody is sent, and selling is not among what is done in town", () => {
    const game = stocked();
    game.shops = ["miller"];
    expect(stallsKnown(game)).toEqual([]);
    expect(doingsAt(game, "town")).toEqual(["buy", "explore"]);
    expect(whyNotSell(game, "sage", "berries")).toBe("shop");
    expect(sellInTown(game, "sage", "berries")).toBe(false);
    expect(game.stock.berries).toBe(5);
    game.shops.push("greengrocer");
    expect(doingsAt(game, "town")).toEqual(["buy", "sell", "explore"]);
    expect(whyNotSell(game, "sage", "berries")).toBeNull();
    // …and the herbalist's is another stall: finding the one does not sell what the other deals in.
    expect(whyNotSell(game, "sage", "herbs")).toBe("shop");
    expect(goodsToSell(game).map((g) => g.good)).not.toContain("herbs");
    expect(goodsToSell(game).find((g) => g.good === "berries")).toMatchObject({ have: 5, price: 3 });
  });

  it("with only a stall found, there is selling in town and no buying: a stall sells the house nothing", () => {
    const game = stocked();
    game.shops = ["greengrocer"];
    expect(doingsAt(game, "town")).toEqual(["sell", "explore"]);
    game.shops = ["miller"];
    expect(doingsAt(game, "town")).toEqual(["buy", "explore"]);
  });

  it("wants some of the thing in the house, and nobody who is out already", () => {
    const game = stocked();
    game.stock.berries = 0;
    expect(whyNotSell(game, "sage", "berries")).toBe("nothing");
    expect(sellInTown(game, "sage", "berries")).toBe(false);
    expect(whyNotSell(game, "nobody", "herbs")).toBe("nobody");
    expect(sellInTown(game, "sage", "herbs")).toBe(true);
    expect(whyNotSell(game, "sage", "potato")).toBe("out");
  });

  it("takes what there is of the one thing, up to what her basket holds, out of the pantry as she goes; and is an errand's length", () => {
    const game = stocked();
    const sent = game.clock;
    expect(lotsToSell(game, "herbs")).toBe(BASKET_HOLDS);
    expect(sellInTown(game, "sage", "herbs", true)).toBe(true);
    expect(game.stock.herbs).toBe(20 - BASKET_HOLDS);
    expect(outingOf(game, "sage")).toMatchObject({ to: "town", doing: "sell", basket: { herbs: BASKET_HOLDS }, sells: "herbs", purse: 0, done: true, back: sent + ERRAND_MINUTES });
    // Of what there are few of, all of them.
    expect(sellInTown(game, "evelyn", "potato")).toBe(true);
    expect(outingOf(game, "evelyn")?.basket.potato).toBe(3);
    expect(game.stock.potato).toBe(0);
    // Nothing else goes with her.
    expect(game.stock.berries).toBe(5);
  });

  it("brings what it fetched home: the coin is the house's when she is in at the door, and not before; she carries nothing through the house", () => {
    const game = stocked();
    const coin = game.coin;
    sellInTown(game, "sage", "herbs", true);
    until(game, () => outingStatus(game, game.outings[0]).is === "selling", 2 * HOUR);
    expect(outingStatus(game, game.outings[0])).toMatchObject({ is: "selling", at: "town", good: "herbs", load: BASKET_HOLDS });
    expect(game.coin).toBe(coin);
    until(game, () => outingOf(game, "sage")?.state === "coming", 3 * HOUR);
    expect(game.coin).toBe(coin);
    // In at the door with it, she is home: there is nothing of hers to be carried anywhere first.
    until(game, () => game.coin > coin, 30 * 60);
    expect(outingOf(game, "sage")).toBeUndefined();
    expect(game.coin).toBe(coin + BASKET_HOLDS * 5);
    expect(person(game, "sage").carrying).toBeNull();
    // What she did not take is still in the pantry, and no more of it came back.
    run(game, 60);
    expect(game.stock.herbs).toBe(20 - BASKET_HOLDS);
    expect(game.coin).toBe(coin + BASKET_HOLDS * 5);
  });

  it("is not exploring: the town is no better known for it", () => {
    const game = stocked();
    const explored = game.explored.town ?? 0;
    sellInTown(game, "sage", "berries", true);
    home(game, "sage");
    expect(game.explored.town ?? 0).toBe(explored);
  });
});
