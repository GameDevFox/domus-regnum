import { giveOrders, go, isIdle, outOfDoors, spotOf, work } from "../space";
import type { Actor, Order } from "../space";
import { stepChores } from "./chores";
import { CROPS, CROP_IDS, TENDING_SECONDS, everySquare, tend, tendingOf } from "./garden";
import type { Tending } from "./garden";
import { AISLE_FOOT, standAt, PLOT_AT } from "./grounds";
import { HANDLING_SECONDS, SPOT } from "./tuning";
import type { Game, GardenTask } from "./types";

// Whoever has the garden: she goes out at the kitchen's back door, up the path and along the
// aisle between the plots, and sees to each square of each plot that wants it, from where she
// stands in the aisle beside the plot: picks what is ripe, sows what is wanted where a square
// is empty, waters what grows. With nothing more to see to she comes in, what she has picked
// goes on its shelf in the pantry, and she does housework until a square wants her again. The garden is a little of her day, not the whole of it.

/** What her work is called while she is at it. */
const LABEL: Record<Tending, string> = { harvest: "picking", sow: "sowing", water: "watering" };

const carried = (task: GardenTask): boolean => CROP_IDS.some((crop) => task.has[crop]);

/** The orders that take her to a plot: out at the back door first, if she is in the house. */
const toPlot = (game: Game, actor: Actor, plot: number): Order[] => [
  ...(outOfDoors(game.world, actor) ? [] : [go(SPOT.backDoor)]),
  { do: "path", points: [...(outOfDoors(game.world, actor) ? [] : [AISLE_FOOT]), standAt(plot)] },
  { do: "face", ...PLOT_AT[plot] },
];

/** The orders that bring her in, and what she has picked to its shelf. */
const comeIn = (game: Game, actor: Actor, task: GardenTask): Order[] => {
  const door = spotOf(game.world, SPOT.backDoor);
  return [
    ...(outOfDoors(game.world, actor) ? [{ do: "path" as const, points: [AISLE_FOOT, { x: door.x, z: door.z }] }] : []),
    ...(carried(task) ? [go(game.world.plan.stores.produce), work(HANDLING_SECONDS, "setting down"), { do: "put" as const }] : []),
  ];
};

export const stepGardener = (game: Game, actor: Actor, task: GardenTask): void => {
  if (!isIdle(actor)) return;
  const done = task.step;
  task.step = null;
  if (done === "in") {
    // She is in, and what she picked is on its shelf.
    // What she has picked is put away: with the rest of what is grown, or, for what is something else once it is in the house (wheat is flour), with that.
    for (const crop of CROP_IDS) {
      if (CROPS[crop].becomes === "flour") game.flour += task.has[crop] ?? 0;
      else game.stock[crop] += task.has[crop] ?? 0;
    }
    task.has = {};
  } else if (done !== null && task.plot !== null && task.square !== null) {
    const picked = tend(game, task.plot, task.square, done);
    if (picked) {
      task.has[picked.crop] = (task.has[picked.crop] ?? 0) + picked.count;
      // What she last picked is seen in her arms.
      actor.carrying = picked.crop;
    }
  }
  task.plot = null;
  task.square = null;
  // Taken off the garden, she sees to nothing more: she comes in with what she has, and that is the end of it.
  const next = task.last ? undefined : everySquare(game).find(({ bed }) => tendingOf(bed) !== null);
  if (next) {
    const what = tendingOf(next.bed) as Tending;
    task.plot = next.plot;
    task.square = next.square;
    task.step = what;
    // (Another square of the plot she is stood beside is seen to from where she stands: the way to it is no way at all.)
    giveOrders(game.world, actor.id, [...toPlot(game, actor, next.plot), work(TENDING_SECONDS[what], LABEL[what])]);
  } else if (outOfDoors(game.world, actor) || carried(task)) {
    task.step = "in";
    giveOrders(game.world, actor.id, comeIn(game, actor, task));
  } else if (task.last) delete game.tasks[actor.id];
  // Nothing in the garden wants her: the house does.
  else stepChores(game, actor);
};

/**
 * She is taken off the garden, or the day is over. What she was in the middle of at a plot is
 * left undone. In the house with empty hands, that is all, and it is false; out of doors, or
 * with something picked, she has still to come in and put it away, and it is true.
 */
export const leaveGarden = (game: Game, actor: Actor, task: GardenTask): boolean => {
  if (!outOfDoors(game.world, actor) && !carried(task)) return false;
  if (task.last) return true;
  Object.assign(task, { last: true, step: null, plot: null, square: null });
  // She stops where she stands; the next thing she does is come in.
  giveOrders(game.world, actor.id, []);
  return true;
};
