import { describe, expect, it } from "vitest";

import { playsWholeDays } from "../test-timeout";
import { giveOrders, go, work } from "../space";
import { assign, needOf } from "./game";
import { ALCHEMISTS, DEVICES, invent, inventing, isAlchemist, mayWork, offered } from "./lab";
import { progressOf } from "./progress";
import { shopOpen } from "./shop";
import { gameAt, person, roomOf, run, until } from "./test-kit";
import { BAKE_SECONDS, EVERWARM_PACE, HOUR, INVENTION_GROWTH, INVENTION_MINUTES, LOAF_PRICE, LOAVES_PER_SACK, SHOP_OPENS, SHOP_SHUTS, TILL_SECONDS } from "./tuning";
import type { DeviceId, Game } from "./types";

playsWholeDays();

// Inventions: the Master's hours at work in the laboratory become devices, and each device is a step.

/** Only these bake; the shelf is kept bare, the flour does not run out, and these devices are already made. */
const bakery = (bakers: string[], devices: DeviceId[] = []): Game => {
  const game = gameAt(SHOP_OPENS);
  game.shelf.bread = 0;
  game.flour = 1000;
  game.devices = devices;
  for (const id of game.household) assign(game, id, bakers.includes(id) ? "bake" : null);
  return game;
};
/** Loaves baked an hour, over a working day. */
const rate = (bakers: string[], devices: DeviceId[] = []): number => {
  const game = bakery(bakers, devices);
  let made = 0;
  run(game, 8 * HOUR, () => {
    made += game.shelf.bread;
    game.shelf.bread = 0;
  });
  return made / 8;
};
const ALL = ["evelyn", "sage", "rose", "master"];

describe("the laboratory", () => {
  it("turns the Master's work there into a measure that fills", () => {
    const game = gameAt(SHOP_OPENS);
    expect(game.lab).toEqual({ progress: 0, needed: INVENTION_MINUTES, ready: false });
    let worked = 0;
    run(game, 4 * HOUR, () => {
      if (inventing(game)) worked += 1 / 60;
    });
    expect(worked).toBeGreaterThan(20);
    expect(game.lab.progress).toBeCloseTo(worked, 0);
  });

  it("fills only while he is at work in it: not while he walks, takes tea, or writes up in his study", () => {
    const game = gameAt(SHOP_OPENS);
    let last = 0;
    run(game, 4 * HOUR, () => {
      const master = person(game, "master");
      // The laboratory is the cellar's east room, under the dining room.
      const inLab = master.walker.pos.y < -1 && master.walker.pos.x >= 12;
      if (game.lab.progress > last) expect(inLab, `it filled while he was at ${master.walker.pos.x.toFixed(1)}, ${master.walker.pos.y.toFixed(1)}`).toBe(true);
      last = game.lab.progress;
    });
    expect(last).toBeGreaterThan(0);
    // And he was out of it for most of those hours: the measure holds far less than the time that passed.
    expect(last).toBeLessThan(4 * HOUR * 0.4);
  });

  it("does not fill for work elsewhere in the cellar: it is the laboratory that counts", () => {
    const game = gameAt(SHOP_OPENS);
    giveOrders(game.world, "master", [go("store.cheese"), work(60, "rummaging")]);
    until(game, () => person(game, "master").label === "rummaging", 60);
    const before = game.lab.progress;
    run(game, 30);
    expect(person(game, "master").label).toBe("rummaging");
    expect(game.lab.progress).toBe(before);
  });

  it("does not fill while he has a job in the house: the bakery costs his inventing", () => {
    const game = bakery(["master"]);
    run(game, 4 * HOUR, () => {
      game.shelf.bread = 0;
    });
    expect(game.lab.progress).toBe(0);
  });

  it("is full after so many minutes of his work, says so once, and waits there for the choice", () => {
    const game = gameAt(SHOP_OPENS);
    game.lab.progress = INVENTION_MINUTES - 1;
    until(game, () => game.lab.ready, HOUR);
    expect(game.lab.progress).toBe(INVENTION_MINUTES);
    expect(game.feats).toEqual([{ who: "master", what: "invention", at: expect.any(Number) }]);
    run(game, 2 * HOUR);
    expect(game.lab.progress).toBe(INVENTION_MINUTES);
    expect(game.feats.length).toBe(1);
    expect(game.devices).toEqual([]);
  });
});

describe("the alchemy as a job", () => {
  it("is the Master's when a game begins, and only an alchemist's to have: nobody else can be given it", () => {
    const game = gameAt(SHOP_OPENS);
    expect(game.posts.master).toBe("lab");
    expect(ALCHEMISTS).toEqual(["master"]);
    expect(isAlchemist("master")).toBe(true);
    for (const id of ["evelyn", "rose", "sage"]) {
      expect(mayWork(id, "lab")).toBe(false);
      const before = game.posts[id];
      expect(assign(game, id, "lab")).toBe(false);
      // …and nothing is changed by the asking: she keeps what she had, and he keeps the alchemy.
      expect(game.posts[id]).toBe(before);
      expect(game.posts.master).toBe("lab");
    }
    // Any other job is anybody's, an alchemist's too.
    for (const job of ["bake", "shop", "garden"] as const) expect(mayWork("sage", job) && mayWork("master", job)).toBe(true);
  });

  it("taken off it, he is at his leisure and nothing is invented; given it again, the measure fills from where it was", () => {
    const game = gameAt(SHOP_OPENS);
    run(game, HOUR);
    const had = game.lab.progress;
    expect(had).toBeGreaterThan(0);
    expect(assign(game, "master", null)).toBe(true);
    const seen = new Set<string>();
    run(game, 2 * HOUR, () => {
      expect(inventing(game)).toBe(false);
      const label = person(game, "master").label;
      if (label) seen.add(label);
    });
    expect(game.lab.progress).toBe(had);
    // He reads and takes his tea: he is not seen at the furnace or the bench.
    expect([...seen].sort()).toEqual(["browsing", "looking out", "reading", "taking tea"]);
    expect(progressOf(game, "master")).toBeNull();
    expect(assign(game, "master", "lab")).toBe(true);
    run(game, HOUR);
    expect(game.lab.progress).toBeGreaterThan(had);
  });

  it("is the having of the job, not the being in the room: at work at the bench without it, he invents nothing", () => {
    const game = gameAt(SHOP_OPENS);
    assign(game, "master", null);
    giveOrders(game.world, "master", [go("lab.bench"), work(120, "tinkering")]);
    until(game, () => person(game, "master").label === "tinkering", 120);
    const had = game.lab.progress;
    run(game, 30);
    expect(person(game, "master").label).toBe("tinkering");
    expect(inventing(game)).toBe(false);
    expect(game.lab.progress).toBe(had);
  });

  it("is as far on as the measure is full; and with the measure full he waits to be told what it is spent on", () => {
    const game = gameAt(SHOP_OPENS);
    until(game, () => game.lab.progress >= game.lab.needed / 2, 8 * HOUR);
    expect(progressOf(game, "master")?.share).toBeCloseTo(game.lab.progress / game.lab.needed);
    expect(progressOf(game, "master")?.waiting).toBe(false);
    until(game, () => game.lab.ready, 8 * HOUR);
    // He finishes what he had in hand, and then stands waiting.
    until(game, () => game.tasks.master?.job === "lab" && game.tasks.master.step === null && person(game, "master").busy <= 0, 10 * 60);
    expect(needOf(game, "master")).toBe("choice");
    expect(progressOf(game, "master")).toEqual({ share: 1, waiting: true, lastStep: false });
    const stood = { ...person(game, "master").walker.pos };
    run(game, 60);
    expect(person(game, "master").walker.pos).toEqual(stood);
    // The device chosen, he goes on.
    expect(invent(game, "dumbwaiter")).toBe(true);
    expect(needOf(game, "master")).toBeNull();
    until(game, () => game.tasks.master?.step === "work", 60);
    expect(progressOf(game, "master")?.share).toBeLessThan(0.1);
  });

  it("with nothing left to invent there is nothing to be through, and he does not wait on anything", () => {
    const game = gameAt(SHOP_OPENS);
    game.devices.push(...DEVICES.map((d) => d.id));
    run(game, 60);
    expect(offered(game)).toEqual([]);
    expect(progressOf(game, "master")).toEqual({ share: null, waiting: false, lastStep: false });
  });
});

describe("choosing an invention", () => {
  it("offers every device not yet made", () => {
    const game = gameAt();
    expect(offered(game).map((d) => d.id)).toEqual(DEVICES.map((d) => d.id));
    game.devices = ["till"];
    expect(offered(game).map((d) => d.id)).toEqual(["dumbwaiter", "everwarm"]);
  });

  it("cannot be done before the measure is full", () => {
    const game = gameAt();
    expect(invent(game, "till")).toBe(false);
    expect(game.devices).toEqual([]);
  });

  it("makes the device at once, empties the measure, and the next takes longer", () => {
    const game = gameAt();
    game.lab = { progress: INVENTION_MINUTES, needed: INVENTION_MINUTES, ready: true };
    expect(invent(game, "till")).toBe(true);
    expect(game.devices).toEqual(["till"]);
    expect(game.lab).toEqual({ progress: 0, needed: INVENTION_MINUTES * INVENTION_GROWTH, ready: false });
    expect(INVENTION_GROWTH).toBeGreaterThan(1);
  });

  it("makes each device once", () => {
    const game = gameAt();
    game.devices = ["till"];
    game.lab.ready = true;
    expect(invent(game, "till")).toBe(false);
    expect(game.lab.ready).toBe(true);
  });

  it("leaves the measure empty once there is nothing left to invent", () => {
    const game = gameAt(SHOP_OPENS);
    game.devices = DEVICES.map((d) => d.id);
    run(game, 3 * HOUR);
    expect(game.lab.progress).toBe(0);
    expect(game.lab.ready).toBe(false);
  });
});

describe("the dumbwaiter", () => {
  it("keeps the baker in the kitchen: flour comes up there, and the loaves go through from there", () => {
    const game = bakery(["evelyn"], ["dumbwaiter"]);
    // The first walk is from wherever she was; after one batch she is in her round.
    until(game, () => game.shelf.bread >= LOAVES_PER_SACK, 3 * HOUR);
    const been = new Set<string | undefined>();
    const flour = game.flour;
    game.shelf.bread = 0;
    until(game, () => {
      been.add(roomOf(game, "evelyn"));
      return game.shelf.bread >= 2 * LOAVES_PER_SACK;
    }, 3 * HOUR);
    expect([...been]).toEqual(["kitchen"]);
    expect(game.flour).toBe(flour - 2);
  });

  it("is a step: a baker bakes half as much again, so two do what took three", () => {
    const [without, with_] = [rate(["evelyn"]), rate(["evelyn"], ["dumbwaiter"])];
    expect(with_ / without).toBeGreaterThan(1.4);
    expect(rate(["evelyn", "sage"], ["dumbwaiter"])).toBeGreaterThan(rate(["evelyn", "sage", "master"]) * 0.93);
  });

  it("moves the bottleneck to the oven: a fourth baker then adds almost nothing, and is seen waiting for it", () => {
    const three = rate(["evelyn", "sage", "master"], ["dumbwaiter"]);
    const four = rate(ALL, ["dumbwaiter"]);
    expect(four / three).toBeLessThan(1.1);
    const game = bakery(ALL, ["dumbwaiter"]);
    let waiting = 0;
    run(game, 2 * HOUR, () => {
      game.shelf.bread = 0;
      waiting += ALL.filter((id) => needOf(game, id) === "oven").length / 60;
    });
    // Bakers' minutes spent waiting for the oven, in two hours: more than one baker's whole time.
    expect(waiting).toBeGreaterThan(2 * HOUR * 0.5);
  });
});

describe("the ever-warm oven", () => {
  it("bakes a batch in half the time", () => {
    const game = bakery(["evelyn"], ["everwarm"]);
    let baking = 0;
    const done = (): number => game.baked.evelyn ?? 0;
    until(game, () => done() >= LOAVES_PER_SACK, 3 * HOUR);
    until(game, () => {
      if (person(game, "evelyn").label === "baking") baking += 1 / 60;
      game.shelf.bread = 0;
      return done() >= 2 * LOAVES_PER_SACK;
    }, 3 * HOUR);
    expect(baking).toBeCloseTo(BAKE_SECONDS / EVERWARM_PACE, 0);
  });

  it("is the step after the dumbwaiter: with both, four bakers bake half as much again as with the dumbwaiter alone", () => {
    const both = rate(ALL, ["dumbwaiter", "everwarm"]);
    expect(both / rate(ALL, ["dumbwaiter"])).toBeGreaterThan(1.4);
  });

  it("is worth little to a lone baker, whose oven is never waited for", () => {
    expect(rate(["evelyn"], ["everwarm"]) / rate(["evelyn"])).toBeLessThan(1.2);
  });
});

describe("the clockwork till", () => {
  /** A day's trade with these baking, and nobody keeping the shop. */
  const dayWithTill = (custom: number, bakers: string[], devices: DeviceId[]): Game => {
    const game = bakery(bakers, devices);
    game.custom = custom;
    game.shelf.bread = 12;
    run(game, SHOP_SHUTS - SHOP_OPENS + 30);
    return game;
  };

  it("opens the shop with nobody keeping it", () => {
    const game = bakery(["evelyn"]);
    expect(shopOpen(game)).toBe(false);
    game.devices = ["till"];
    expect(shopOpen(game)).toBe(true);
  });

  it("lets a customer help herself to a loaf and pay for it, a moment after she reaches the counter", () => {
    const game = bakery([], ["till"]);
    game.shelf.bread = 5;
    const coin = game.coin;
    until(game, () => game.customers.some((c) => c.state === "waiting"), 60);
    // Not the instant she arrives: it takes her a moment.
    run(game, TILL_SECONDS - 0.5);
    expect(game.sold).toBe(0);
    until(game, () => game.sold === 1, 1);
    expect([game.shelf.bread, game.coin]).toEqual([4, coin + LOAF_PRICE]);
  });

  it("sells no loaf twice when somebody keeps the shop as well", () => {
    const game = bakery([], ["till"]);
    assign(game, "rose", "shop");
    game.custom = 4;
    game.shelf.bread = 24;
    const coin = game.coin;
    run(game, 2 * HOUR);
    expect(game.sold).toBeGreaterThan(10);
    expect(game.shelf.bread).toBe(24 - game.sold);
    expect(game.coin).toBe(coin + game.sold * LOAF_PRICE);
  });

  it("never sells a loaf that is not there: a shopkeeper and the till both serving a shelf that is nearly always bare", () => {
    // One baker against six times the custom: every loaf is wanted by several people at once.
    const game = bakery(["evelyn"], ["till"]);
    assign(game, "rose", "shop");
    game.custom = 6;
    game.shelf.bread = 2;
    const coin = game.coin;
    let fewest = game.shelf.bread;
    run(game, SHOP_SHUTS - SHOP_OPENS, () => {
      fewest = Math.min(fewest, game.shelf.bread);
    });
    expect(fewest).toBe(0);
    expect(game.sold).toBeGreaterThan(30);
    expect(game.coin).toBe(coin + game.sold * LOAF_PRICE);
    expect(game.sold + game.shelf.bread).toBe(2 + (game.baked.evelyn ?? 0));
  });

  it("gives nothing where there is no bread: she waits, and in the end goes without", () => {
    const game = bakery([], ["till"]);
    run(game, 2 * HOUR);
    expect(game.sold).toBe(0);
    expect(game.lost).toBeGreaterThan(0);
  });

  it("is a step: the fourth pair of hands can bake, and the house serves a custom it could not", () => {
    expect(dayWithTill(4, ALL, ["till"]).today.lost).toBe(0);
    // Without it, four steps of custom is more than one counter can serve (hands.test.ts); and with it, three bakers are too few.
    expect(dayWithTill(4, ["evelyn", "sage", "master"], ["till"]).today.lost).toBeGreaterThan(10);
  });

  it("with all three devices the house serves five times the first day's custom", () => {
    expect(dayWithTill(5, ALL, ["till", "dumbwaiter", "everwarm"]).today.lost).toBe(0);
    expect(dayWithTill(5, ALL, ["till"]).today.lost).toBeGreaterThan(10);
  });
});
