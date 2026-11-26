import { describe, expect, it } from "vitest";

import { asleep } from "./bedtime";
import { backAt, errandCost, outingOf } from "./outing";
import { sendToTown, whyNotSend } from "./outing-send";
import { orderCost } from "./flour";
import { assign } from "./game";
import { shopOpen } from "./shop";
import { NINE, gameAt, inHouse, person, roomOf, run, until, whereSheMayBe } from "./test-kit";
import { BEDTIME, DAY, DELIVERY_HOURS, ERRAND_MINUTES, ERRAND_SACKS, FLOUR_COST, HOUR, LOAVES_PER_SACK, START_FLOUR, WAKE } from "./tuning";
import type { Game } from "./types";

// An errand into town: given at any hour of the day, a known time long, and, with the return asked for, home with flour.

/** Nine in the morning, coin to spend, and nobody baking, so that the flour on the shelf changes only by what is brought. */
const quiet = (): Game => {
  const game = gameAt(NINE);
  game.coin = 100;
  assign(game, "evelyn", null);
  return game;
};

describe("an errand into town", () => {
  it("takes the coin for what she will buy with her, and no fee for a cart", () => {
    const game = quiet();
    expect(sendToTown(game, "sage", "flour", true)).toBe(true);
    expect(game.coin).toBe(100 - ERRAND_SACKS * FLOUR_COST);
    expect(errandCost()).toBeLessThan(orderCost(ERRAND_SACKS));
    expect(game.flour).toBe(START_FLOUR);
  });

  it("goes out at the front door, and she is out of the house until she is back", () => {
    const game = quiet();
    sendToTown(game, "sage", "flour", true);
    const been = new Set<string>();
    until(game, () => {
      const room = inHouse(game, "sage") ? roomOf(game, "sage") : undefined;
      if (room) been.add(room);
      return !inHouse(game, "sage");
    }, 60);
    expect(been.has("hall")).toBe(true);
    // Out at the front door, she walks down the drive, and is gone from the property at the gate.
    expect(outingOf(game, "sage")?.state).toBe("leaving");
    until(game, () => outingOf(game, "sage")?.state === "away", 30);
    expect(outingOf(game, "sage")?.gone?.walker.pos.z).toBeGreaterThan(21);
    run(game, 30);
    expect(inHouse(game, "sage")).toBe(false);
    expect(game.flour).toBe(START_FLOUR);
  });

  it("has her at the door again a known time after she was sent, wherever in the house she set out from", () => {
    const backs = ["sage", "master"].map((id) => {
      const game = quiet();
      sendToTown(game, id, "flour", true);
      expect(outingOf(game, id)?.back).toBe(backAt(NINE));
      until(game, () => !inHouse(game, id), 90);
      until(game, () => inHouse(game, id), ERRAND_MINUTES);
      expect(roomOf(game, id)).toBe("hall");
      return game.clock;
    });
    expect(backs[0]).toBeCloseTo(NINE + ERRAND_MINUTES, 0);
    expect(backs[1]).toBeCloseTo(NINE + ERRAND_MINUTES, 0);
  });

  it("brings the flour home in her arms: it is on the shelf once she has carried it through to the pantry", () => {
    const game = quiet();
    sendToTown(game, "sage", "flour", true);
    until(game, () => outingOf(game, "sage")?.state === "returning", ERRAND_MINUTES + 5);
    expect(person(game, "sage").carrying).toBe("flour");
    expect(game.flour).toBe(START_FLOUR);
    until(game, () => game.flour === START_FLOUR + ERRAND_SACKS, 60);
    expect(roomOf(game, "sage")).toBe("pantry");
    expect(outingOf(game, "sage")).toBeUndefined();
    expect(person(game, "sage").carrying).toBeNull();
  });

  it("is quicker than the carter and costs less, and is a pair of hands gone the while", () => {
    expect(ERRAND_MINUTES).toBeLessThan(DELIVERY_HOURS * HOUR);
    const game = gameAt(NINE);
    game.coin = 100;
    game.shelf.bread = 0;
    assign(game, "rose", null);
    sendToTown(game, "evelyn", "flour", true);
    until(game, () => !inHouse(game, "evelyn"), 120);
    const loaves = game.shelf.bread;
    run(game, ERRAND_MINUTES / 2);
    // Nobody bakes while the baker is out.
    expect(game.shelf.bread).toBe(loaves);
  });

  it("leaves her job hers: the baker bakes again once the flour is set down", () => {
    const game = gameAt(NINE);
    game.coin = 100;
    game.shelf.bread = 0;
    assign(game, "rose", null);
    sendToTown(game, "evelyn", "flour", true);
    expect(game.posts.evelyn).toBe("bake");
    until(game, () => outingOf(game, "evelyn") === undefined, ERRAND_MINUTES + 120);
    const loaves = game.shelf.bread;
    until(game, () => game.shelf.bread >= loaves + LOAVES_PER_SACK, 120);
  });

  it("lets a baker with loaves in her arms set them on the shelf before she goes", () => {
    const game = gameAt(NINE);
    game.coin = 100;
    game.shelf.bread = 0;
    assign(game, "rose", null);
    until(game, () => game.tasks.evelyn?.job === "bake" && game.tasks.evelyn.has === "bread");
    sendToTown(game, "evelyn", "flour", true);
    until(game, () => !inHouse(game, "evelyn"), 120);
    expect(game.shelf.bread).toBe(LOAVES_PER_SACK);
  });

  it("given a job while she is out, is called home to it: the coin for the flour not yet bought is the house's again, and she takes the job up once she is in", () => {
    const game = quiet();
    game.shelf.bread = 0;
    assign(game, "rose", null);
    sendToTown(game, "sage", "flour", true);
    until(game, () => outingOf(game, "sage")?.state === "away", 120);
    run(game, 10);
    expect(game.clock).toBeLessThan(outingOf(game, "sage")!.arrive);
    expect(assign(game, "sage", "bake")).toBe(true);
    expect(game.posts.sage).toBe("bake");
    expect(game.coin).toBe(100);
    expect(outingOf(game, "sage")).toMatchObject({ to: "manor", homeward: true, doing: null, buys: null });
    until(game, () => outingOf(game, "sage") === undefined, ERRAND_MINUTES);
    expect(game.flour).toBe(START_FLOUR);
    until(game, () => game.tasks.sage?.job === "bake", 5);
  });

  it("taken off a job while she is out, is not called home", () => {
    const game = quiet();
    assign(game, "sage", "shop");
    sendToTown(game, "sage", "flour", true);
    until(game, () => outingOf(game, "sage")?.state === "away", 120);
    expect(assign(game, "sage", null)).toBe(true);
    expect(outingOf(game, "sage")).toMatchObject({ to: "town", doing: "buy", homeward: false });
  });

  it("does not stop her on her way out when she is taken off her job, nor on her way in with the flour when she is given one", () => {
    const game = quiet();
    assign(game, "sage", "shop");
    sendToTown(game, "sage", "flour", true);
    run(game, 2);
    assign(game, "sage", null);
    until(game, () => outingOf(game, "sage")?.state === "away", 120);
    // Out by the front door and the drive, not from wherever she stood when the job changed.
    expect(outingOf(game, "sage")?.gone?.walker.pos.z).toBeGreaterThan(21);
    until(game, () => outingOf(game, "sage")?.state === "returning", ERRAND_MINUTES);
    run(game, 2);
    assign(game, "sage", "shop");
    expect(person(game, "sage").carrying).toBe("flour");
    expect(game.flour).toBe(START_FLOUR);
    until(game, () => game.flour === START_FLOUR + ERRAND_SACKS, 60);
    expect(roomOf(game, "sage")).toBe("pantry");
  });

  it("shuts the shop while the one who keeps it is out, and opens it when she is back", () => {
    const game = quiet();
    expect(shopOpen(game)).toBe(true);
    sendToTown(game, "rose", "flour", true);
    expect(shopOpen(game)).toBe(false);
    const came = game.arrivals;
    until(game, () => outingOf(game, "rose") === undefined, ERRAND_MINUTES + 120);
    expect(game.arrivals).toBe(came);
    expect(shopOpen(game)).toBe(true);
  });

  it("keeps everyone on the floor, going out and coming in", () => {
    const game = quiet();
    sendToTown(game, "master", "flour", true);
    until(game, () => {
      for (const actor of game.world.actors) expect(whereSheMayBe(game, actor), `${actor.id} is off the floor`).toBe(true);
      return outingOf(game, "master") === undefined;
    }, ERRAND_MINUTES + 180);
  });
});

describe("who can be sent, and when", () => {
  it("anyone of the household, the Master too, and nobody else", () => {
    const game = quiet();
    game.custom = 3;
    until(game, () => game.customers.length > 0);
    expect(whyNotSend(game, game.customers[0].id)).toBe("nobody");
    expect(whyNotSend(game, "master")).toBeNull();
    expect(whyNotSend(game, "evelyn")).toBeNull();
  });

  it("not someone who is already out", () => {
    const game = quiet();
    sendToTown(game, "sage", "flour", true);
    expect(whyNotSend(game, "sage")).toBe("out");
    expect(sendToTown(game, "sage", "flour", true)).toBe(false);
    expect(game.coin).toBe(100 - errandCost());
    expect(game.outings.length).toBe(1);
  });

  it("not without the coin to buy with", () => {
    const game = quiet();
    game.coin = errandCost() - 1;
    expect(whyNotSend(game, "sage")).toBe("coin");
    expect(sendToTown(game, "sage", "flour", true)).toBe(false);
    expect(game.coin).toBe(errandCost() - 1);
  });

  it("not at night: up to the minute before bedtime, and not from it", () => {
    const game = quiet();
    game.clock = BEDTIME - 1;
    expect(whyNotSend(game, "sage")).toBeNull();
    game.clock = BEDTIME;
    expect(whyNotSend(game, "sage")).toBe("night");
    game.clock = DAY + WAKE - 1;
    expect(whyNotSend(game, "sage")).toBe("night");
  });
});

describe("out past bedtime", () => {
  it("the house does not wait up: sent late, she is out as the night passes, and is in with the flour when it wakes", () => {
    const game = quiet();
    game.clock = BEDTIME - HOUR;
    sendToTown(game, "sage", "flour", true);
    until(game, () => asleep(game), 2 * HOUR);
    // Everyone else is in bed, she is not, and the night has begun all the same.
    expect(outingOf(game, "sage")?.state).toBe("away");
    expect(game.household.filter((id) => game.abed[id] === "in").length).toBe(3);
    until(game, () => game.clock >= DAY + WAKE, 30);
    expect(game.abed).toEqual({});
    until(game, () => game.flour === START_FLOUR + ERRAND_SACKS, 60);
    expect(outingOf(game, "sage")).toBeUndefined();
  });
});
