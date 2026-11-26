import { describe, expect, it } from "vitest";

import { BAKES, bestOnShelf, bestToBake, onShelf } from "./bakes";
import { assign, needOf } from "./game";
import { bakedBy } from "./mastery";
import { isAt } from "./place";
import { gameAt, person, run, until } from "./test-kit";
import { LOAF_PRICE, LOAVES_PER_SACK, PIES_PER_BATCH, PIE_BERRIES, PIE_PRICE, SHOP_SHELF_HOLDS, START_COIN, START_FLOUR, TILL_SECONDS } from "./tuning";
import type { BakeTask, Game } from "./types";

// What the kitchen bakes: bread of flour alone, and berry pies when there are berries. A baker
// makes the best thing the pantry has the makings of; a customer is sold the best thing on the
// shelf.

/** The shop's opening, Evelyn baking and Rose keeping the shop, the shelf bare, and so many lots of berries in the pantry. */
const kitchen = (berries: number): Game => {
  const game = gameAt();
  game.shelf.bread = 0;
  game.stock.berries = berries;
  return game;
};
const baking = (game: Game): BakeTask => game.tasks.evelyn as BakeTask;
/** A shop with nobody baking, and this on its shelf. */
const shop = (shelf: Game["shelf"]): Game => {
  const game = gameAt();
  assign(game, "evelyn", null);
  game.shelf = { ...shelf };
  return game;
};

describe("what is baked", () => {
  it("is bread, of flour alone, while there are no berries", () => {
    const game = kitchen(0);
    expect(bestToBake(game)).toBe("bread");
    until(game, () => onShelf(game) > 0, 120);
    expect(game.shelf).toEqual({ bread: LOAVES_PER_SACK, pie: 0 });
    expect(game.flour).toBe(START_FLOUR - 1);
  });

  it("is berry pies when the pantry has the berries for a batch: she fetches them with her flour, and three pies come of a sack and two lots", () => {
    const game = kitchen(PIE_BERRIES);
    // (Nobody keeps the shop, so that what is baked stays on the shelf to be counted.)
    assign(game, "rose", null);
    expect(bestToBake(game)).toBe("pie");
    const stops = new Set<string>();
    until(game, () => {
      const { stores } = game.world.plan;
      for (const shelf of [stores.flour, stores.berries]) if (baking(game)?.step === "fetch" && isAt(game.world, person(game, "evelyn"), shelf)) stops.add(shelf);
      return baking(game)?.has === "flour";
    }, 60);
    expect([...stops].sort()).toEqual([game.world.plan.stores.flour, game.world.plan.stores.berries].sort());
    expect(baking(game).makes).toBe("pie");
    expect([game.flour, game.stock.berries]).toEqual([START_FLOUR - 1, 0]);
    until(game, () => baking(game).has === "pie", 120);
    expect(person(game, "evelyn").carrying).toBe("pie");
    until(game, () => onShelf(game) > 0, 60);
    expect(game.shelf).toEqual({ bread: 0, pie: PIES_PER_BATCH });
    // The mastery is of bread: pies are not counted towards it.
    expect(bakedBy(game, "evelyn")).toBe(0);
    // With the berries gone the next batch is bread again.
    until(game, () => game.shelf.bread > 0, 120);
    expect(game.shelf).toEqual({ bread: LOAVES_PER_SACK, pie: PIES_PER_BATCH });
    expect(bakedBy(game, "evelyn")).toBe(LOAVES_PER_SACK);
  });

  it("is bread when there are berries, but not enough for a batch: they are left on the shelf", () => {
    const game = kitchen(PIE_BERRIES - 1);
    until(game, () => onShelf(game) > 0, 120);
    expect(game.shelf).toEqual({ bread: LOAVES_PER_SACK, pie: 0 });
    expect(game.stock.berries).toBe(PIE_BERRIES - 1);
  });

  it("is bread after all if the berries she set out for are gone when she gets there, and none are taken that are not there", () => {
    const game = kitchen(PIE_BERRIES);
    until(game, () => baking(game)?.step === "fetch", 30);
    expect(baking(game).makes).toBe("pie");
    game.stock.berries = 0;
    until(game, () => baking(game).has === "flour", 60);
    expect(baking(game).makes).toBe("bread");
    expect(game.stock.berries).toBe(0);
    until(game, () => onShelf(game) > 0, 120);
    expect(game.shelf).toEqual({ bread: LOAVES_PER_SACK, pie: 0 });
  });

  it("goes back to the pantry, flour and berries both, if she is taken off before it is baked", () => {
    const game = kitchen(PIE_BERRIES);
    until(game, () => baking(game)?.has === "dough", 120);
    expect([game.flour, game.stock.berries]).toEqual([START_FLOUR - 1, 0]);
    assign(game, "evelyn", null);
    expect([game.flour, game.stock.berries]).toEqual([START_FLOUR, PIE_BERRIES]);
    expect(game.tasks.evelyn).toBeUndefined();
  });

  it("is set on the shelf first if she is taken off with pies in her arms", () => {
    const game = kitchen(PIE_BERRIES);
    until(game, () => baking(game)?.has === "pie", 120);
    assign(game, "evelyn", null);
    expect(baking(game).last).toBe(true);
    until(game, () => game.tasks.evelyn === undefined, 60);
    expect(game.shelf.pie).toBe(PIES_PER_BATCH);
    expect([game.flour, game.stock.berries]).toEqual([START_FLOUR - 1, 0]);
  });

  it("waits for room on the shelf, which loaves and pies share", () => {
    const game = kitchen(0);
    game.shelf = { bread: SHOP_SHELF_HOLDS / 2, pie: SHOP_SHELF_HOLDS / 2 };
    assign(game, "rose", null);
    run(game, 20);
    expect(needOf(game, "evelyn")).toBe("room");
    expect(game.flour).toBe(START_FLOUR);
    game.shelf.pie = 0;
    until(game, () => baking(game).has !== null, 30);
  });
});

describe("what is sold", () => {
  it("is the best thing on the shelf: a pie while there is one, at a pie's price, and then bread", () => {
    const game = shop({ bread: 5, pie: 1 });
    expect(bestOnShelf(game)).toBe("pie");
    until(game, () => game.sold === 1, 120);
    expect(game.shelf).toEqual({ bread: 5, pie: 0 });
    expect(game.coin).toBe(START_COIN + PIE_PRICE);
    // She goes off with what she was sold.
    expect(game.world.actors.some((a) => a.carrying === "pie" && a.id.startsWith("customer-"))).toBe(true);
    until(game, () => game.sold === 2, 120);
    expect(game.shelf).toEqual({ bread: 4, pie: 0 });
    expect(game.coin).toBe(START_COIN + PIE_PRICE + LOAF_PRICE);
  });

  it("can be pies alone: the shopkeeper wants for nothing while there is one, and for something to sell when the last is gone", () => {
    const game = shop({ bread: 0, pie: 1 });
    until(game, () => game.sold === 1, 120);
    expect(game.coin).toBe(START_COIN + PIE_PRICE);
    expect(bestOnShelf(game)).toBeNull();
    until(game, () => needOf(game, "rose") === "loaves", 120);
    expect(game.sold).toBe(1);
  });

  it("leaves the shopkeeper wanting for nothing while there is so much as a pie, with someone at the counter", () => {
    const game = shop({ bread: 0, pie: 1 });
    run(game, 1);
    game.customers.push({ id: "someone", place: 0, state: "waiting", waited: 0 });
    expect(needOf(game, "rose")).toBeNull();
    game.shelf.pie = 0;
    expect(needOf(game, "rose")).toBe("loaves");
  });

  it("is a pie from a clockwork till as well: she helps herself to the best there is", () => {
    const game = shop({ bread: 3, pie: 1 });
    assign(game, "rose", null);
    game.devices = ["till"];
    until(game, () => game.customers.some((c) => c.state === "waiting"), 60);
    run(game, TILL_SECONDS + 0.5);
    expect([game.sold, game.coin]).toEqual([1, START_COIN + PIE_PRICE]);
    expect(game.shelf).toEqual({ bread: 3, pie: 0 });
  });

  it("is dearer for a pie than for a loaf, and a batch of pies is worth more than a batch of bread", () => {
    expect(BAKES.pie.price).toBeGreaterThan(BAKES.bread.price);
    expect(BAKES.pie.price * BAKES.pie.batch).toBeGreaterThan(BAKES.bread.price * BAKES.bread.batch);
  });
});
