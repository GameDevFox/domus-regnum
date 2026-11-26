import { giveOrders, go, isIdle, work } from "../space";
import type { Actor } from "../space";
import { BAKES, bestToBake, hasMakings, needsOf, onShelf } from "./bakes";
import { claim, release } from "./claims";
import { hasDevice } from "./lab";
import { creditLoaves, handsPace } from "./mastery";
import { isAt } from "./place";
import { BAKE_SECONDS, EVERWARM_PACE, HANDLING_SECONDS, KNEAD_SECONDS, LOAVES_PER_SACK, SHOP_SHELF_HOLDS, SPOT } from "./tuning";
import type { BakeTask, BatchStep, Game, Need } from "./types";

// A baker's round: flour from the pantry shelf, kneaded at her own place at the kitchen table,
// baked in the oven, and the loaves carried through to the shop's shelf. Each step ends when she
// has nothing left to do; the stock changes then, and the next step is taken up.
//
// What she bakes is the best thing the pantry has the makings of (bakes.ts): with berries on the
// shelf she fetches them with her flour, and it is pies that come out of the oven.
//
// Several can bake at once. Each has a place of her own at the table; the oven takes one batch
// at a time, so a baker whose dough is ready while it is in use waits at her place for her turn.

/** Batches somebody has started and not yet set on the shop's shelf, her own apart (if one is named). */
export const underWay = (game: Game, but: BakeTask | null = null): number =>
  game.household.filter((id) => {
    const task = game.tasks[id];
    return task?.job === "bake" && task !== but && (task.has !== null || task.step === "fetch");
  }).length;

/** What stops her starting another batch, if anything: no flour, or no room on the shelf for it and for those already on their way. */
export const bakerNeeds = (game: Game, task: BakeTask): Need | null => {
  if (game.flour < 1) return "flour";
  // (A batch on its way is reckoned at the most a batch can be.)
  return onShelf(game) + (underWay(game, task) + 1) * LOAVES_PER_SACK > SHOP_SHELF_HOLDS ? "room" : null;
};

/** What a baker standing idle is waiting for, if anything. */
export const bakerWaitsFor = (game: Game, id: string, task: BakeTask): Need | null => {
  if (task.next === "fetch") return bakerNeeds(game, task);
  return task.next === "bake" && game.claims[SPOT.oven] !== id ? "oven" : null;
};

/** The step in hand is done: the stock changes, and what comes next is settled. */
const finish = (game: Game, actor: Actor, task: BakeTask, step: BatchStep): void => {
  if (step === "fetch") {
    // Someone else may have had the last sack while she walked to the shelf.
    if (game.flour < 1) return;
    // …or the last of what else she came for: then it is bread, which wants nothing else.
    if (!hasMakings(game, task.makes)) task.makes = "bread";
    game.flour -= 1;
    for (const [thing, lots] of needsOf(task.makes)) game.stock[thing] -= lots;
    task.has = "flour";
    task.next = "knead";
  } else if (step === "knead") {
    task.has = "dough";
    task.next = "bake";
  } else if (step === "bake") {
    release(game, SPOT.oven, actor.id);
    // Out of the oven: the house knows how to make it from now.
    if (!game.recipes.includes(task.makes)) game.recipes.push(task.makes);
    task.has = task.makes;
    task.next = "deliver";
  } else {
    game.shelf[task.makes] += BAKES[task.makes].batch;
    // The mastery is of bread: it is loaves that are counted towards it.
    if (task.makes === "bread") creditLoaves(game, actor.id, LOAVES_PER_SACK);
    task.has = null;
    task.next = "fetch";
  }
  // What is in her arms is seen there at once, while she waits as much as while she walks.
  actor.carrying = task.has;
};

/** Take up the next step if what it needs is there. False if she has to wait. */
const start = (game: Game, actor: Actor, task: BakeTask, place: string): boolean => {
  const { world } = game;
  // Her own work goes faster once she has the mastery; the oven bakes as it always did.
  const pace = handsPace(game, actor.id);
  const orders = {
    // With a dumbwaiter the flour is in the kitchen: the pantry's shelves come up to her. Without, she goes to the flour's shelf, and then to the shelf of whatever else is to go in.
    fetch: () => (hasDevice(game, "dumbwaiter") ? [SPOT.hatch] : [world.plan.stores.flour, ...needsOf(task.makes).map(([thing]) => world.plan.stores[thing])]).flatMap((shelf) => [go(shelf), work(HANDLING_SECONDS / pace, "fetching")]),
    knead: () => [go(place), work(KNEAD_SECONDS / pace, "kneading")],
    bake: () => [go(SPOT.oven), work(BAKE_SECONDS / (hasDevice(game, "everwarm") ? EVERWARM_PACE : 1), "baking")],
    // ...and what she sets down there goes through to the shop's shelf.
    deliver: () => [go(hasDevice(game, "dumbwaiter") ? SPOT.hatch : SPOT.stock), work(HANDLING_SECONDS / pace, "setting down")],
  };
  if (task.next === "fetch" && bakerNeeds(game, task) !== null) return false;
  if (task.next === "bake" && !claim(game, SPOT.oven, actor.id)) return false;
  // What the batch is to be is settled as she sets out for its makings: the best thing the pantry has them for.
  if (task.next === "fetch") task.makes = bestToBake(game);
  task.step = task.next;
  giveOrders(world, actor.id, orders[task.next]());
  return true;
};

/** A batch she is taken off before it is baked goes back to the pantry: the sack of flour, and whatever else went in. */
export const putBack = (game: Game, task: BakeTask): void => {
  game.flour += 1;
  for (const [thing, lots] of needsOf(task.makes)) game.stock[thing] += lots;
};

export const stepBaker = (game: Game, actor: Actor, task: BakeTask): void => {
  if (!isIdle(actor)) return;
  const finished = task.step;
  task.step = null;
  if (finished !== null && finished !== "return") finish(game, actor, task, finished);
  if (finished === "deliver" && task.last) {
    delete game.tasks[actor.id];
    return;
  }
  // Her own place at the table: the first that nobody has.
  task.place ??= SPOT.knead.find((spot) => claim(game, spot, actor.id)) ?? null;
  if (task.place === null) return;
  if (start(game, actor, task, task.place)) return;
  // Nothing to be done yet: she waits at her place.
  if (!isAt(game.world, actor, task.place)) {
    task.step = "return";
    giveOrders(game.world, actor.id, [go(task.place)]);
  }
};
