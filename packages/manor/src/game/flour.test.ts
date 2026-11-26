import { describe, expect, it } from "vitest";

import { playsWholeDays } from "../test-timeout";
import { outOfDoors } from "../space";
import { dueAt, flourOnItsWay, orderCost, orderFlour } from "./flour";
import { assign, needOf } from "./game";
import { NINE, gameAt, person, roomOf, run, until, whereSheMayBe } from "./test-kit";
import { BEDTIME, CART_FROM, CART_UNTIL, DAY, DELIVERY_FEE, DELIVERY_HOURS, FLOUR_COST, HOUR, LOAVES_PER_SACK, ORDER_SIZES, SHOP_OPENS, START_COIN, START_FLOUR } from "./tuning";
import type { Game } from "./types";

playsWholeDays();

// Flour: plenty to begin with, and more only by ordering it, which takes time and always costs the cart.

/** A game at nine in the morning with coin to spend. */
const rich = (): Game => {
  const game = gameAt(NINE);
  game.coin = 500;
  return game;
};
const carters = (game: Game) => game.world.actors.filter((a) => a.id.startsWith("carter-"));

describe("the flour the house begins with", () => {
  it("is plenty: more than a baker can use on the first day", () => {
    const game = gameAt(SHOP_OPENS);
    run(game, BEDTIME - SHOP_OPENS);
    expect(game.flour).toBeGreaterThan(START_FLOUR / 4);
    expect(needOf(game, "evelyn")).not.toBe("flour");
  });
});

describe("an order of flour", () => {
  it("is paid for at once: the sacks, and the cart", () => {
    const game = rich();
    expect(orderFlour(game, 12)).toBe(true);
    expect(game.coin).toBe(500 - 12 * FLOUR_COST - DELIVERY_FEE);
    expect(game.flour).toBe(START_FLOUR);
    expect(flourOnItsWay(game)).toBe(12);
  });

  it("always costs the cart, whatever its size: so a sack is cheaper in a large order", () => {
    const perSack = ORDER_SIZES.map((sacks) => orderCost(sacks) / sacks);
    expect(orderCost(1) - FLOUR_COST).toBe(orderCost(24) - 24 * FLOUR_COST);
    expect(DELIVERY_FEE).toBeGreaterThan(0);
    expect([...perSack].sort((a, b) => b - a)).toEqual(perSack);
    expect(new Set(perSack).size).toBe(ORDER_SIZES.length);
  });

  it("cannot be placed without the coin for both", () => {
    const game = gameAt(NINE);
    game.coin = orderCost(4) - 1;
    expect(orderFlour(game, 4)).toBe(false);
    expect([game.coin, game.deliveries.length]).toEqual([orderCost(4) - 1, 0]);
    expect(START_COIN).toBeGreaterThanOrEqual(0);
  });

  it("takes time: nothing is on the shelf until the hours are up and the carter has carried it in", () => {
    const game = rich();
    orderFlour(game, 4);
    const used = (): number => START_FLOUR + 4 - game.flour;
    run(game, DELIVERY_HOURS * HOUR - 5);
    expect(carters(game)).toEqual([]);
    expect(game.flour).toBeLessThanOrEqual(START_FLOUR);
    until(game, () => carters(game).length === 1, 10);
    expect(game.flour).toBeLessThanOrEqual(START_FLOUR);
    const before = game.flour;
    until(game, () => game.flour > before, 60);
    expect(game.flour - before).toBeGreaterThanOrEqual(4 - 1);
    expect(used()).toBeGreaterThan(0);
    expect(flourOnItsWay(game)).toBe(0);
  });

  it("is brought in at the kitchen's back door, carried to the pantry, and the carter goes out the way he came", () => {
    const game = rich();
    assign(game, "evelyn", null);
    orderFlour(game, 4);
    until(game, () => carters(game).length === 1, DELIVERY_HOURS * HOUR + 10);
    const id = carters(game)[0].id;
    // His cart is in the lane behind the house: he is first seen out of doors, at the far end of the back path.
    const lane = { ...person(game, id).walker.pos };
    expect(outOfDoors(game.world, person(game, id))).toBe(true);
    expect(lane.z).toBeLessThan(0);
    expect(person(game, id).carrying).toBe("flour");
    const been: string[] = [];
    let last = lane;
    until(game, () => {
      const carter = game.world.actors.find((a) => a.id === id);
      if (!carter) return true;
      const room = roomOf(game, id) ?? "out of doors";
      if (been[been.length - 1] !== room) been.push(room);
      last = { ...carter.walker.pos };
      expect(whereSheMayBe(game, carter), "the carter is off the floor, or off the back path").toBe(true);
      return false;
    }, 120);
    // Up the path and in at the kitchen's back door, to the pantry, and off the way he came: he is gone where he was first seen, on the other side of the path.
    expect(been).toEqual(["out of doors", "kitchen", "pantry", "kitchen", "out of doors"]);
    expect(Math.abs(last.z - lane.z)).toBeLessThan(0.2);
    expect(last.x - lane.x).toBeCloseTo(0.6, 1);
    expect(game.flour).toBe(START_FLOUR + 4);
    expect(game.deliveries).toEqual([]);
  });

  it("sets a baker who was waiting for flour going again", () => {
    const game = rich();
    assign(game, "rose", null);
    game.flour = 0;
    game.shelf.bread = 0;
    orderFlour(game, 4);
    run(game, 60);
    expect(needOf(game, "evelyn")).toBe("flour");
    until(game, () => game.shelf.bread >= LOAVES_PER_SACK, DELIVERY_HOURS * HOUR + 120);
  });

  it("comes in the order it was asked for, each by its own cart", () => {
    const game = rich();
    assign(game, "evelyn", null);
    orderFlour(game, 4);
    run(game, 30);
    orderFlour(game, 12);
    expect(flourOnItsWay(game)).toBe(16);
    until(game, () => game.flour === START_FLOUR + 4, DELIVERY_HOURS * HOUR + 60);
    until(game, () => game.flour === START_FLOUR + 16, 120);
  });
});

describe("the carter's day", () => {
  it("brings by day what is ordered by day, so many hours on", () => {
    expect(dueAt(NINE)).toBe(NINE + DELIVERY_HOURS * HOUR);
    expect(dueAt(DAY * 3 + NINE)).toBe(DAY * 3 + NINE + DELIVERY_HOURS * HOUR);
    expect(dueAt(CART_UNTIL - DELIVERY_HOURS * HOUR)).toBe(CART_UNTIL);
  });

  it("brings first thing tomorrow what would come after his day is over", () => {
    expect(dueAt(CART_UNTIL - DELIVERY_HOURS * HOUR + 1)).toBe(DAY + CART_FROM);
    expect(dueAt(BEDTIME - 1)).toBe(DAY + CART_FROM);
  });

  it("brings at the start of his day what is ordered before it", () => {
    expect(dueAt(DAY + 1 * HOUR)).toBe(DAY + CART_FROM);
  });

  it("is kept across the night: an evening's order is on the shelf soon after the house wakes", () => {
    const game = rich();
    game.clock = 19 * HOUR;
    assign(game, "evelyn", null);
    orderFlour(game, 4);
    until(game, () => game.flour === START_FLOUR + 4, (BEDTIME - 19 * HOUR) + 2 * HOUR + 60);
    expect(game.clock).toBeGreaterThan(DAY + CART_FROM);
    expect(game.clock).toBeLessThan(DAY + CART_FROM + HOUR);
  });
});
