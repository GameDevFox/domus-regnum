import { describe, expect, it } from "vitest";

import { playsWholeDays } from "../test-timeout";
import { assign, createGame, needOf, stepGame } from "./game";
import { shopOpen } from "./shop";
import { atCounter, whereSheMayBe } from "./test-kit";
import { CUSTOMER_PATIENCE, LOAF_PRICE, LOAVES_PER_SACK, SHOP_OPENS, SHOP_SHELF_HOLDS, SPOT, START_COIN, START_FLOUR } from "./tuning";
import type { Game } from "./types";

playsWholeDays();

/** A game with the clock put to the shop's opening, and the shelf bare: these are the rules of trade, seen from the first loaf. */
const openGame = (seed?: number): Game => {
  const game = createGame(undefined, seed);
  game.clock = SHOP_OPENS;
  game.shelf.bread = 0;
  return game;
};
const HZ = 60;
const run = (game: Game, seconds: number, each?: () => void): void => {
  for (let i = 0; i < seconds * HZ; i++) {
    stepGame(game, 1 / HZ);
    each?.();
  }
};
/** Run until something is so, or fail if it has not happened in time. */
const until = (game: Game, so: () => boolean, withinSeconds = 120): void => {
  for (let i = 0; i < withinSeconds * HZ; i++) {
    if (so()) return;
    stepGame(game, 1 / HZ);
  }
  throw new Error("it never happened");
};
const person = (game: Game, id: string) => {
  const actor = game.world.actors.find((a) => a.id === id);
  if (!actor) throw new Error(`nobody called ${id}`);
  return actor;
};
const roomOf = (game: Game, id: string): string | undefined => {
  const { pos } = person(game, id).walker;
  return game.world.plan.rooms.find((r) => r.floor === "ground" && pos.x >= r.rect.x && pos.x <= r.rect.x + r.rect.w && pos.z >= r.rect.z && pos.z <= r.rect.z + r.rect.d)?.id;
};

describe("the bakery's day", () => {
  it("opens with Evelyn baking and Rose keeping the shop", () => {
    const game = openGame();
    expect(game.posts).toEqual({ evelyn: "bake", rose: "shop", master: "lab" });
    expect([game.coin, game.flour, game.shelf.bread]).toEqual([START_COIN, START_FLOUR, 0]);
    expect(shopOpen(game)).toBe(true);
  });

  it("turns each sack of flour into loaves on the shop's shelf, by way of the pantry, the table and the oven", () => {
    const game = openGame();
    assign(game, "rose", null);
    const been = new Set<string>();
    until(game, () => {
      const room = roomOf(game, "evelyn");
      if (room) been.add(room);
      return game.shelf.bread === LOAVES_PER_SACK;
    });
    expect(game.flour).toBe(START_FLOUR - 1);
    expect([...been].sort()).toEqual(["kitchen", "pantry", "shop"]);
  });

  it("sells what is baked: every loaf is either on the shelf or paid for", () => {
    const game = openGame();
    const SACKS = 3;
    game.flour = SACKS;
    run(game, 300);
    expect(game.flour).toBe(0);
    expect(game.sold).toBeGreaterThan(6);
    expect(game.shelf.bread + game.sold).toBe(SACKS * LOAVES_PER_SACK);
    expect(game.coin).toBe(START_COIN + game.sold * LOAF_PRICE);
  });

  it("is the same day again from the same seed, and a different one from another", () => {
    // When each customer came in, who they were, and when each loaf was sold.
    const tally = (seed: number): string => {
      const game = openGame(seed);
      const log: string[] = [];
      let step = 0;
      let [came, sold] = [0, 0];
      run(game, 200, () => {
        step += 1;
        if (game.arrivals !== came) log.push(`${step} in ${game.world.actors[game.world.actors.length - 1].sprite}`);
        if (game.sold !== sold) log.push(`${step} sold`);
        [came, sold] = [game.arrivals, game.sold];
      });
      return log.join(", ");
    };
    expect(tally(7)).toBe(tally(7));
    expect(tally(7)).not.toBe(tally(8));
  });

  it("keeps everyone on the floor, customers too, and sends each customer out again", () => {
    const game = openGame();
    let most = 0;
    let mostAtCounter = 0;
    run(game, 240, () => {
      most = Math.max(most, game.world.actors.length);
      for (const actor of game.world.actors) expect(whereSheMayBe(game, actor), `${actor.id} is off the floor`).toBe(true);
      mostAtCounter = Math.max(mostAtCounter, atCounter(game).length);
    });
    expect(game.arrivals).toBeGreaterThan(10);
    // Four live here; no more than three customers stand at the counter, whoever else is on the way up to the door or away from it.
    expect(most).toBeGreaterThan(game.household.length);
    expect(mostAtCounter).toBeGreaterThan(0);
    expect(mostAtCounter).toBeLessThanOrEqual(SPOT.places.length);
    expect(game.world.actors.length).toBe(game.household.length + game.customers.length);
    expect(game.deliveries).toEqual([]);
  });
});

describe("flour", () => {
  it("running out leaves the baker waiting at her table for it, and a sack sets her going again", () => {
    const game = openGame();
    assign(game, "rose", null);
    game.flour = 1;
    until(game, () => game.shelf.bread === LOAVES_PER_SACK);
    // She is in the shop with nothing to bake: she goes back to the kitchen to wait.
    run(game, 15);
    expect(needOf(game, "evelyn")).toBe("flour");
    expect(roomOf(game, "evelyn")).toBe("kitchen");
    game.flour += 1;
    until(game, () => roomOf(game, "evelyn") === "pantry", 20);
    expect(needOf(game, "evelyn")).toBeNull();
  });
});

describe("the shop's shelf", () => {
  it("holds only so much: with no room for another batch the baker waits, and no flour is used", () => {
    const game = openGame();
    assign(game, "rose", null);
    game.flour = 10;
    run(game, 400);
    expect(game.shelf.bread).toBe(SHOP_SHELF_HOLDS);
    expect(game.flour).toBe(10 - SHOP_SHELF_HOLDS / LOAVES_PER_SACK);
    expect(needOf(game, "evelyn")).toBe("room");
  });
});

describe("customers", () => {
  it("come only while somebody keeps the shop", () => {
    const game = openGame();
    assign(game, "rose", null);
    run(game, 120);
    expect(game.arrivals).toBe(0);
    assign(game, "sage", "shop");
    run(game, 60);
    expect(game.arrivals).toBeGreaterThan(2);
  });

  it("give up when there is no bread, and are counted", () => {
    const game = openGame();
    assign(game, "evelyn", null);
    let mostStanding = 0;
    run(game, CUSTOMER_PATIENCE * 3, () => {
      mostStanding = Math.max(mostStanding, atCounter(game).length);
    });
    // The counter has three places; with all of them taken, whoever else comes in at the door walks out again.
    expect(mostStanding).toBe(SPOT.places.length);
    expect(game.sold).toBe(0);
    expect(game.lost).toBeGreaterThan(0);
    expect(game.coin).toBe(START_COIN);
    expect(needOf(game, "rose")).toBe("loaves");
  });

  it("are served in the order they came", () => {
    const game = openGame();
    assign(game, "evelyn", null);
    // Custom enough that the counter fills before the first to come has given up.
    game.custom = 3;
    // With no bread, the counter fills up; then bread arrives for all of them at once.
    until(game, () => game.customers.filter((c) => c.state === "waiting").length === SPOT.places.length, 60);
    const came = atCounter(game).map((c) => c.id);
    game.shelf.bread = SPOT.places.length;
    const seenTo: string[] = [];
    until(game, () => {
      for (const c of game.customers) if (c.state === "attended" && !seenTo.includes(c.id)) seenTo.push(c.id);
      return game.sold === SPOT.places.length;
    }, 60);
    expect(seenTo).toEqual(came);
  });
});

describe("jobs", () => {
  it("the shop is kept by one: giving it to Sage takes Rose off it", () => {
    const game = openGame();
    assign(game, "sage", "shop");
    expect(game.posts).toEqual({ evelyn: "bake", sage: "shop", master: "lab" });
    expect(game.tasks.rose).toBeUndefined();
  });

  it("can be swapped between two people", () => {
    const game = openGame();
    assign(game, "evelyn", "shop");
    expect(game.posts).toEqual({ evelyn: "shop", master: "lab" });
    assign(game, "rose", "bake");
    expect(game.posts).toEqual({ evelyn: "shop", rose: "bake", master: "lab" });
    run(game, 200);
    expect(game.sold).toBeGreaterThan(0);
  });

  it("are not for customers", () => {
    const game = openGame();
    until(game, () => game.customers.length > 0);
    expect(assign(game, game.customers[0].id, "bake")).toBe(false);
    expect(game.posts.evelyn).toBe("bake");
  });

  it("put the flour back when the baker is taken off before the loaves are out of the oven", () => {
    const game = openGame();
    until(game, () => game.tasks.evelyn?.step === "knead");
    expect(game.flour).toBe(START_FLOUR - 1);
    assign(game, "evelyn", null);
    expect(game.flour).toBe(START_FLOUR);
    run(game, 1);
    expect(person(game, "evelyn").carrying).toBeNull();
    run(game, 120);
    expect(game.shelf.bread).toBe(0);
  });

  it("let her finish carrying loaves through before she leaves the job", () => {
    const game = openGame();
    assign(game, "rose", null);
    until(game, () => game.tasks.evelyn?.step === "deliver");
    assign(game, "evelyn", null);
    expect(game.shelf.bread).toBe(0);
    until(game, () => game.shelf.bread === LOAVES_PER_SACK, 30);
    run(game, 60);
    expect(game.tasks.evelyn).toBeUndefined();
    expect(game.flour).toBe(START_FLOUR - 1);
  });

  it("leave a customer who was being fetched for still in turn when the shopkeeper is changed", () => {
    const game = openGame();
    game.shelf.bread = SHOP_SHELF_HOLDS;
    assign(game, "evelyn", null);
    until(game, () => game.customers.some((c) => c.state === "attended"));
    assign(game, "sage", "shop");
    expect(game.customers.every((c) => c.state !== "attended")).toBe(true);
    until(game, () => game.sold === 1, 60);
  });

  it("are taken up at once: someone called from the housework drops it where she stands", () => {
    const game = openGame();
    assign(game, "rose", null);
    // Her round of housework is a long one, down to the cellar and back: wait until she has it in her arms.
    until(game, () => person(game, "rose").carrying !== null, 60);
    assign(game, "rose", "shop");
    run(game, 0.5);
    expect(person(game, "rose").carrying).toBeNull();
    // Already on her way back to the counter, not finishing the round first.
    expect(game.tasks.rose?.step).toBe("return");
    until(game, () => game.sold > 0, 90);
  });

  it("leave those without one to the housework, and the Master to his own day", () => {
    const game = openGame();
    run(game, 240);
    expect(person(game, "sage").errands).toBeGreaterThan(3);
    expect(person(game, "master").errands).toBeGreaterThan(3);
    expect(game.tasks.sage).toBeUndefined();
  });
});
