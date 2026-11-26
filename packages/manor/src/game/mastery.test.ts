import { describe, expect, it } from "vitest";

import { playsWholeDays } from "../test-timeout";
import { assign } from "./game";
import { bakedBy, creditLoaves, isMaster } from "./mastery";
import { gameAt, person, run, until } from "./test-kit";
import { BAKE_SECONDS, HOUR, KNEAD_SECONDS, LOAVES_PER_SACK, MASTERY_LOAVES, MASTERY_PACE, SHOP_OPENS } from "./tuning";
import type { Game } from "./types";

playsWholeDays();

// Mastery: a step, not a slope. So many loaves baked, and her own part of a batch is twice as quick.

/** Only these bake; the shelf is kept bare so that nobody waits for room, and the flour does not run out. */
const bakery = (bakers: string[]): Game => {
  const game = gameAt(SHOP_OPENS);
  game.shelf.bread = 0;
  game.flour = 1000;
  for (const id of game.household) assign(game, id, bakers.includes(id) ? "bake" : null);
  return game;
};
const bake = (game: Game, hours: number): void => {
  run(game, hours * HOUR, () => {
    game.shelf.bread = 0;
  });
};
/** Seconds someone spends at each kind of work over one whole batch, begun after she next sets one down. */
const timesOfABatch = (game: Game, id: string): Record<string, number> => {
  const times: Record<string, number> = {};
  const done = bakedBy(game, id);
  until(game, () => bakedBy(game, id) > done, 200);
  let last = game.world.t;
  until(game, () => {
    const { label } = person(game, id);
    if (label) times[label] = (times[label] ?? 0) + (game.world.t - last);
    last = game.world.t;
    game.shelf.bread = 0;
    return bakedBy(game, id) > done + LOAVES_PER_SACK;
  }, 200);
  return times;
};

describe("practice", () => {
  it("counts the loaves someone has baked as hers, and nobody else's", () => {
    const game = bakery(["evelyn", "sage"]);
    until(game, () => bakedBy(game, "sage") === 2 * LOAVES_PER_SACK, 4 * HOUR);
    expect(bakedBy(game, "evelyn")).toBeGreaterThanOrEqual(LOAVES_PER_SACK);
    expect(bakedBy(game, "rose")).toBe(0);
    expect(bakedBy(game, "evelyn") + bakedBy(game, "sage")).toBe(1000 * LOAVES_PER_SACK - game.flour * LOAVES_PER_SACK - (game.tasks.evelyn?.job === "bake" && game.tasks.evelyn.has ? LOAVES_PER_SACK : 0) - (game.tasks.sage?.job === "bake" && game.tasks.sage.has ? LOAVES_PER_SACK : 0));
  });

  it("is kept when she is taken off the baking and put back", () => {
    const game = bakery(["evelyn"]);
    until(game, () => bakedBy(game, "evelyn") === LOAVES_PER_SACK, 2 * HOUR);
    assign(game, "evelyn", null);
    assign(game, "evelyn", "bake");
    expect(bakedBy(game, "evelyn")).toBe(LOAVES_PER_SACK);
  });
});

describe("the mastery of bread", () => {
  it("is had or not: not a loaf before the hundredth, and for good from it", () => {
    const game = bakery([]);
    creditLoaves(game, "evelyn", MASTERY_LOAVES - 1);
    expect(isMaster(game, "evelyn")).toBe(false);
    creditLoaves(game, "evelyn", 1);
    expect(isMaster(game, "evelyn")).toBe(true);
    expect(isMaster(game, "sage")).toBe(false);
  });

  it("is marked once, at the moment it comes, with whose it is", () => {
    const game = bakery([]);
    game.clock = 900;
    creditLoaves(game, "evelyn", MASTERY_LOAVES - LOAVES_PER_SACK);
    expect(game.feats).toEqual([]);
    creditLoaves(game, "evelyn", LOAVES_PER_SACK);
    creditLoaves(game, "evelyn", LOAVES_PER_SACK);
    expect(game.feats).toEqual([{ who: "evelyn", what: "bread", at: 900 }]);
  });

  it("comes of baking: the batch that makes a hundred loaves brings it", () => {
    const game = bakery(["evelyn"]);
    game.baked.evelyn = MASTERY_LOAVES - LOAVES_PER_SACK;
    until(game, () => game.feats.length === 1, 2 * HOUR);
    expect(game.feats[0].who).toBe("evelyn");
    expect(bakedBy(game, "evelyn")).toBe(MASTERY_LOAVES);
  });

  it("halves her own work, the kneading and the handling, and leaves the oven's time as it was", () => {
    const novice = timesOfABatch(bakery(["evelyn"]), "evelyn");
    const game = bakery(["evelyn"]);
    game.baked.evelyn = MASTERY_LOAVES;
    const master = timesOfABatch(game, "evelyn");
    expect(novice.kneading).toBeCloseTo(KNEAD_SECONDS, 0);
    expect(master.kneading).toBeCloseTo(KNEAD_SECONDS / MASTERY_PACE, 0);
    expect(master.fetching).toBeCloseTo(novice.fetching / MASTERY_PACE, 0);
    expect(master["setting down"]).toBeCloseTo(novice["setting down"] / MASTERY_PACE, 0);
    expect(novice.baking).toBeCloseTo(BAKE_SECONDS, 0);
    expect(master.baking).toBeCloseTo(BAKE_SECONDS, 0);
  });

  it("is felt: a master bakes a good deal more in a day than she did", () => {
    const loaves = (start: number): number => {
      const game = bakery(["evelyn"]);
      game.baked.evelyn = start;
      bake(game, 10);
      return bakedBy(game, "evelyn") - start;
    };
    const [novice, master] = [loaves(-10000), loaves(MASTERY_LOAVES)];
    expect(master / novice).toBeGreaterThan(1.12);
  });

  it("is each person's own: one master at the table does not hurry the others", () => {
    const game = bakery(["evelyn", "sage"]);
    game.baked.evelyn = MASTERY_LOAVES;
    expect(timesOfABatch(game, "sage").kneading).toBeCloseTo(KNEAD_SECONDS, 0);
  });
});
