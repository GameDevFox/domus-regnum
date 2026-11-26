import { describe, expect, it } from "vitest";

import { playsWholeDays } from "../test-timeout";
import { newMorning } from "./custom";
import { assign, needOf } from "./game";
import { atCounter, gameAt, person, run, until } from "./test-kit";
import { BEDTIME, CUSTOMER_EVERY, DAY, HOUR, JOB_PLACES, LOAVES_PER_SACK, SHOP_OPENS, SHOP_SHUTS, SPOT, WAKE } from "./tuning";
import type { BakeTask, Game } from "./types";

playsWholeDays();

// Several hands at one job, the oven they share, and the custom that makes more hands worth having.

const bakeTask = (game: Game, id: string): BakeTask => {
  const task = game.tasks[id];
  if (task?.job !== "bake") throw new Error(`${id} is not baking`);
  return task;
};
/** The shop's opening with a bare shelf, flour that does not run out, and nobody selling: only these bake. */
const bakery = (bakers: string[], seed?: number): Game => {
  const game = gameAt(SHOP_OPENS, seed);
  game.shelf.bread = 0;
  game.flour = 1000;
  for (const id of game.household) assign(game, id, bakers.includes(id) ? "bake" : null);
  return game;
};
/** Loaves that reach the shop's shelf in so many hours, with nobody selling them. */
const bakedIn = (game: Game, hours: number): number => {
  let made = 0;
  run(game, hours * HOUR, () => {
    made += game.shelf.bread;
    game.shelf.bread = 0;
  });
  return made;
};

describe("the baking, shared", () => {
  it("is held by as many as are given it, each at a place of her own at the table", () => {
    const game = bakery(["evelyn", "sage", "master"]);
    expect(game.posts).toEqual({ evelyn: "bake", sage: "bake", master: "bake" });
    const kneadedAt: Record<string, string> = {};
    until(game, () => {
      for (const id of ["evelyn", "sage", "master"]) if (person(game, id).label === "kneading") kneadedAt[id] = bakeTask(game, id).place as string;
      return Object.keys(kneadedAt).length === 3;
    });
    const places = Object.values(kneadedAt);
    expect(new Set(places).size).toBe(3);
    for (const place of places) expect(SPOT.knead).toContain(place);
  });

  it("has a place for everyone in the house, and no more than the table has", () => {
    expect(JOB_PLACES.bake).toBe(SPOT.knead.length);
    const game = bakery(["evelyn", "rose", "sage", "master"]);
    expect(Object.values(game.posts)).toEqual(["bake", "bake", "bake", "bake"]);
  });

  it("never has two at the oven at once: the second waits at her place with her dough", () => {
    const game = bakery(["evelyn", "sage", "master"]);
    let waited = false;
    run(game, 4 * HOUR, () => {
      const baking = game.household.filter((id) => person(game, id).label === "baking");
      expect(baking.length).toBeLessThanOrEqual(1);
      for (const id of game.household) {
        if (needOf(game, id) !== "oven") continue;
        waited = true;
        expect(person(game, id).carrying).toBe("dough");
      }
    });
    expect(waited).toBe(true);
  });

  it("gives up the oven and her place when she is taken off, so the next can have them", () => {
    const game = bakery(["evelyn", "sage"]);
    until(game, () => game.claims[SPOT.oven] === "evelyn");
    const place = bakeTask(game, "evelyn").place as string;
    assign(game, "evelyn", null);
    expect(game.claims[SPOT.oven]).toBeUndefined();
    expect(game.claims[place]).toBeUndefined();
    until(game, () => game.claims[SPOT.oven] === "sage");
  });

  it("does not start more batches than the shelf has room for, however many are baking", () => {
    const game = bakery(["evelyn", "sage", "master"]);
    let most = 0;
    run(game, 6 * HOUR, () => {
      most = Math.max(most, game.shelf.bread);
    });
    expect(most).toBe(24);
    expect(game.shelf.bread).toBe(24);
    expect(game.flour).toBe(1000 - 24 / LOAVES_PER_SACK);
  });
});

describe("the ratio", () => {
  // The author's figure: three people making bread for every one selling it. Measured where it
  // matters: at the custom one counter can just serve, how many bakers does it take to keep it in bread?
  it("is three to one: at the busiest one counter can be, three bakers keep it in bread and two cannot", () => {
    const BUSIEST = 3;
    const two = dayOfTrade(BUSIEST, ["evelyn", "sage"], 1);
    const three = dayOfTrade(BUSIEST, ["evelyn", "sage", "master"], 1);
    expect(three.today.lost).toBe(0);
    expect(two.today.lost).toBeGreaterThan(10);
    expect(two.sold).toBeLessThan(three.sold * 0.9);
    // And three bake no more than is wanted: little is left on the shelf at the day's end.
    expect(three.shelf.bread).toBeLessThan(24);
  });

  it("is three to one from the other side too: one more step of custom is more than one shopkeeper can serve", () => {
    const game = dayOfTrade(4, ["evelyn", "sage", "master"], 1);
    expect(game.today.lost).toBeGreaterThan(10);
  });

  it("is even from the start: one baker bakes a little more than the first day's custom wants", () => {
    const baked = bakedIn(bakery(["evelyn"]), 8) / 8;
    const wanted = HOUR / CUSTOMER_EVERY;
    expect(baked).toBeGreaterThan(wanted);
    expect(baked).toBeLessThan(wanted * 1.6);
  });
});

/** A whole day's trade, eight till six, at a level of custom with so many bakers. */
const dayOfTrade = (custom: number, bakers: string[], seed: number): Game => {
  const game = gameAt(SHOP_OPENS, seed);
  game.custom = custom;
  game.flour = 1000;
  for (const id of bakers) assign(game, id, "bake");
  run(game, (SHOP_SHUTS - SHOP_OPENS) + 30);
  return game;
};

describe("custom", () => {
  it("brings customers as many times as often as the first day's", () => {
    const came = (custom: number): number => {
      const game = gameAt();
      game.custom = custom;
      game.shelf.bread = 0;
      game.flour = 1000;
      run(game, 2 * HOUR, () => {
        game.shelf.bread = 12;
      });
      return game.arrivals;
    };
    const [one, two] = [came(1), came(2)];
    expect(two / one).toBeGreaterThan(1.7);
    expect(two / one).toBeLessThan(2.3);
  });

  it("is kept up with by as many bakers: nobody goes without on the first three days' custom", () => {
    for (const seed of [1, 2, 3]) {
      expect(dayOfTrade(1, ["evelyn"], seed).today.lost, `seed ${seed}, one baker`).toBe(0);
      expect(dayOfTrade(2, ["evelyn", "sage"], seed).today.lost, `seed ${seed}, two`).toBe(0);
      expect(dayOfTrade(3, ["evelyn", "sage", "master"], seed).today.lost, `seed ${seed}, three`).toBe(0);
    }
  });

  it("outruns a house that has not the hands for it: people go without, and nothing else is lost", () => {
    const short = dayOfTrade(2, ["evelyn"], 1);
    expect(short.today.lost).toBeGreaterThan(10);
    expect(short.coin).toBeGreaterThan(dayOfTrade(1, ["evelyn"], 1).coin);
  });

  it("counts someone who finds the counter full as going without", () => {
    const game = gameAt();
    assign(game, "evelyn", null);
    game.shelf.bread = 0;
    game.custom = 6;
    until(game, () => atCounter(game).length === SPOT.places.length, 60);
    const before = game.lost;
    until(game, () => game.lost > before, CUSTOMER_EVERY);
    expect(game.customers.every((c) => c.waited < 25)).toBe(true);
  });

  it("grows by a step after a day on which bread was sold and nobody went without", () => {
    const game = gameAt();
    game.today = { sold: 40, lost: 0 };
    newMorning(game);
    expect(game.custom).toBe(2);
    expect(game.today).toEqual({ sold: 0, lost: 0 });
  });

  it("stays as it was after a day on which anyone went without, or nothing was sold: never less", () => {
    const game = gameAt();
    game.custom = 3;
    game.today = { sold: 40, lost: 1 };
    newMorning(game);
    expect(game.custom).toBe(3);
    game.today = { sold: 0, lost: 0 };
    newMorning(game);
    expect(game.custom).toBe(3);
  });

  it("is reckoned as the house wakes: a good first day brings twice the custom on the second", () => {
    const game = gameAt();
    game.flour = 1000;
    until(game, () => game.clock >= DAY + WAKE, (BEDTIME - SHOP_OPENS) + 4 * HOUR);
    expect(game.lost).toBe(0);
    expect(game.custom).toBe(2);
    expect(game.today).toEqual({ sold: 0, lost: 0 });
  });
});
