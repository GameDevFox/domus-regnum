import { describe, expect, it } from "vitest";

import { isIdle } from "../space";
import { stepBaker, underWay } from "./bakery";
import { gameAt, person, until } from "./test-kit";
import type { BakeTask, Game } from "./types";

// A baker's round (bakery.ts), for tasks made up whole: how many batches are under way, and a
// baker who comes to fetch flour and finds the pantry bare.

const batch = (over: Partial<BakeTask> = {}): BakeTask => ({ job: "bake", step: null, next: "fetch", makes: "bread", has: null, place: null, last: false, ...over });
/** The first two of the household, with the tasks given. */
const bakers = (game: Game, tasks: [BakeTask | null, BakeTask | null]): [string, string] => {
  const [a, b] = game.household as [string, string];
  game.tasks = {};
  if (tasks[0]) game.tasks[a] = tasks[0];
  if (tasks[1]) game.tasks[b] = tasks[1];
  return [a, b];
};

describe("the batches under way", () => {
  it("are none while nobody has started one", () => {
    const game = gameAt();
    bakers(game, [batch(), batch()]);
    expect(underWay(game)).toBe(0);
  });

  it("count a baker who is on her way to the shelf for flour", () => {
    const game = gameAt();
    bakers(game, [batch({ step: "fetch" }), null]);
    expect(underWay(game)).toBe(1);
  });

  it("count a baker with something in her arms, whatever she is doing with it", () => {
    const game = gameAt();
    bakers(game, [batch({ has: "dough", step: "bake", next: "bake" }), batch({ has: "bread", next: "deliver" })]);
    expect(underWay(game)).toBe(2);
  });

  it("leave out the baker who is asking, so that she does not count against herself", () => {
    const game = gameAt();
    const mine = batch({ step: "fetch" });
    bakers(game, [mine, batch({ has: "flour", next: "knead" })]);
    expect(underWay(game)).toBe(2);
    expect(underWay(game, mine)).toBe(1);
  });

  it("do not count anyone who has another job", () => {
    const game = gameAt();
    const [a] = bakers(game, [null, null]);
    game.tasks[a] = { job: "lab", step: "work" };
    expect(underWay(game)).toBe(0);
  });
});

describe("a baker who has come for flour and finds none", () => {
  it("is left with none taken, and carries nothing", () => {
    const game = gameAt();
    const id = game.household[0];
    const actor = person(game, id);
    until(game, () => isIdle(actor), 120);
    game.tasks = {};
    const task = batch({ step: "fetch", next: "fetch" });
    game.tasks[id] = task;
    game.flour = 0;
    stepBaker(game, actor, task);
    expect(game.flour).toBe(0);
    expect(task.has).toBeNull();
    expect(task.next).toBe("fetch");
  });
});
