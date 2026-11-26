import { describe, expect, it } from "vitest";

import { assign } from "./game";
import { lotsOf, outingOf } from "./outing";
import { gather, sendToTown } from "./outing-send";
import { statsOf } from "./person";
import { gameAt, until } from "./test-kit";
import { BERRY_MINUTES, ERRAND_SACKS, HOUR, LOAVES_PER_SACK, MASTERY_LOAVES, PIES_PER_BATCH, PIE_BERRIES } from "./tuning";
import type { BakeTask, Game } from "./types";

// What there is to say of one person: the bread she has baked, and what she is carrying.

const baking = (game: Game): BakeTask => game.tasks.evelyn as BakeTask;

describe("what someone has baked", () => {
  it("is nothing at first, and four loaves more with each batch she sets on the shelf", () => {
    const game = gameAt();
    game.shelf.bread = 0;
    expect(statsOf(game, "evelyn")).toMatchObject({ baked: 0, master: false });
    until(game, () => game.shelf.bread > 0, 2 * HOUR);
    expect(statsOf(game, "evelyn").baked).toBe(LOAVES_PER_SACK);
    expect(statsOf(game, "rose").baked).toBe(0);
  });

  it("earns her the mastery at a hundred loaves", () => {
    const game = gameAt();
    game.baked.evelyn = MASTERY_LOAVES - 1;
    expect(statsOf(game, "evelyn").master).toBe(false);
    game.baked.evelyn = MASTERY_LOAVES;
    expect(statsOf(game, "evelyn")).toMatchObject({ baked: MASTERY_LOAVES, master: true });
  });
});

describe("what someone is carrying", () => {
  it("is nothing while her hands are free", () => {
    const game = gameAt();
    expect(statsOf(game, "sage").carrying).toEqual([]);
    expect(statsOf(game, "nobody").carrying).toEqual([]);
  });

  it("is a baker's batch as far as it has got: one sack of flour, one of dough, and then four loaves", () => {
    const game = gameAt();
    game.shelf.bread = 0;
    until(game, () => baking(game)?.has === "flour", 60);
    expect(statsOf(game, "evelyn").carrying).toEqual([{ goods: "flour", count: 1 }]);
    until(game, () => baking(game).has === "dough", 120);
    expect(statsOf(game, "evelyn").carrying).toEqual([{ goods: "dough", count: 1 }]);
    until(game, () => baking(game).has === "bread", 120);
    expect(statsOf(game, "evelyn").carrying).toEqual([{ goods: "bread", count: LOAVES_PER_SACK }]);
    until(game, () => baking(game).has === null, 60);
    expect(statsOf(game, "evelyn").carrying).toEqual([]);
  });

  it("is three pies when it is pies she has baked", () => {
    const game = gameAt();
    game.shelf.bread = 0;
    game.stock.berries = PIE_BERRIES;
    until(game, () => baking(game)?.has === "pie", 4 * HOUR);
    expect(statsOf(game, "evelyn").carrying).toEqual([{ goods: "pie", count: PIES_PER_BATCH }]);
  });

  it("is the one loaf the shopkeeper has reached down for a customer", () => {
    const game = gameAt();
    until(game, () => game.world.actors.find((a) => a.id === "rose")?.carrying === "bread", 2 * HOUR);
    expect(statsOf(game, "rose").carrying).toEqual([{ goods: "bread", count: 1 }]);
  });

  it("is what is in her basket while she is out gathering, kind by kind, and when she is in again with it", () => {
    const game = gameAt(9 * HOUR);
    assign(game, "evelyn", null);
    game.places.forest = "found";
    // (What can be gathered there is known too: it is found by exploring now, and these are about what comes after.)
    game.finds.forest = ["berries", "herbs"];
    gather(game, "sage", "forest", { limit: 3 * BERRY_MINUTES, homeByBed: false, thenHome: true });
    expect(statsOf(game, "sage").carrying).toEqual([]);
    until(game, () => lotsOf(outingOf(game, "sage")?.basket ?? {}) === 2, 3 * HOUR);
    expect(statsOf(game, "sage").carrying).toEqual([{ goods: "berries", count: 2 }]);
    until(game, () => outingOf(game, "sage")?.state === "returning", 3 * HOUR);
    expect(statsOf(game, "sage").carrying).toEqual([{ goods: "berries", count: 3 }, { goods: "herbs", count: 1 }]);
    until(game, () => outingOf(game, "sage") === undefined, HOUR);
    expect(statsOf(game, "sage").carrying).toEqual([]);
  });

  it("is her sacks of flour on the way home from town", () => {
    const game = gameAt(9 * HOUR);
    game.coin = 100;
    sendToTown(game, "sage", "flour", true);
    // On her way there she has only the coin for it, which is not hers to carry: nothing.
    until(game, () => outingOf(game, "sage")?.state === "away", HOUR);
    expect(statsOf(game, "sage").carrying).toEqual([]);
    until(game, () => outingOf(game, "sage")?.homeward === true, 3 * HOUR);
    expect(statsOf(game, "sage").carrying).toEqual([{ goods: "flour", count: ERRAND_SACKS }]);
  });
});
