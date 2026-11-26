import { CAST, HOUSE, addActor, createWorld, giveOrders, stepWorld } from "../space";
import type { Actor, Plan } from "../space";
import { onShelf } from "./bakes";
import { bakerWaitsFor, putBack, stepBaker } from "./bakery";
import { asleep, goToBed, passNight } from "./bedtime";
import { stepChores } from "./chores";
import { releaseAll } from "./claims";
import { isNight, nextWake } from "./clock";
import { firstMap } from "./country";
import { CROP_IDS, newGarden, stepGarden } from "./garden";
import type { CropId } from "./garden";
import { leaveGarden, stepGardener } from "./gardener";
import { newMorning } from "./custom";
import { mayWork, newLab, offered, stepAlchemist, stepLab } from "./lab";
import { stepCustomers, stepKeeper } from "./shop";
import { outingOf } from "./outing";
import { stepOuting } from "./outing-step";
import { callHome } from "./outing-tell";
import { SCENES, playScenes } from "./scenes";
import { stepDeliveries } from "./flour";
import { CUSTOMER_EVERY, FIRST_CUSTOM, JOB_PLACES, MINUTES_PER_SECOND, START, START_COIN, START_FLOUR, START_LOAVES } from "./tuning";
import type { Game, JobId, Need, Task } from "./types";
import { newWardrobe } from "./wares";

// The game: the house, what it has, and who has which job. The page calls `stepGame` each tick
// and the commands: `assign` here, `orderFlour` in flour.ts. Everything else follows from those.

const newTask = (job: JobId): Task => (job === "bake" ? { job, step: null, next: "fetch", makes: "bread", has: null, place: null, last: false } : job === "garden" ? { job, step: null, plot: null, square: null, has: {}, last: false } : job === "lab" ? { job, step: null } : { job, step: null, customer: null });

/**
 * Have someone put down whatever she is at, a job or a round of housework: she drops it where
 * she stands. Loaves already in her arms are still delivered.
 */
const standDown = (game: Game, id: string): void => {
  const task = game.tasks[id];
  releaseAll(game, id);
  if (task?.job === "bake") {
    if (task.has === task.makes) {
      task.last = true;
      task.place = null;
      return;
    }
    // The flour she had taken goes back on the shelf, kneaded or not, and so does whatever else was to go in.
    if (task.has !== null) putBack(game, task);
  } else if (task?.job === "garden") {
    // Out among the plots, or with something picked, she has first to come in.
    const actor = game.world.actors.find((a) => a.id === id);
    if (actor && leaveGarden(game, actor, task)) return;
  } else if (task?.job === "shop") {
    const customer = game.customers.find((c) => c.id === task.customer);
    if (customer?.state === "attended") customer.state = "waiting";
  }
  delete game.tasks[id];
  giveOrders(game.world, id, [{ do: "put" }]);
};

/**
 * Take someone off whatever job she holds. On an outing she has already put her work down, and
 * is not to be stopped on her way: only which job is hers when she is home changes.
 */
const relieve = (game: Game, id: string): void => {
  delete game.posts[id];
  if (!outingOf(game, id)) standDown(game, id);
};

/** At night she puts down her work, loaves in her arms first set on the shelf, and goes up to bed. Her job is hers again in the morning. */
const turnIn = (game: Game, actor: Actor): void => {
  if (game.tasks[actor.id]) standDown(game, actor.id);
  const carrying = game.tasks[actor.id];
  if (carrying?.job === "bake") stepBaker(game, actor, carrying);
  else if (carrying?.job === "garden") stepGardener(game, actor, carrying);
  else goToBed(game, actor);
};

/**
 * Give someone a job, or none. A job has room for so many (JOB_PLACES): the baking for as many
 * as there are places at the table, the shop for one. Given to one more than that, the first to
 * have had it is taken off.
 */
export const assign = (game: Game, id: string, job: JobId | null): boolean => {
  if (!game.household.includes(id)) return false;
  // The alchemy is an alchemist's: nobody else can be given it.
  if (job !== null && !mayWork(id, job)) return false;
  // Someone out is called home to a job, which cannot be done where she is: she takes it up when she is in. (Taken off a job, she is not called home.)
  if (job !== null && outingOf(game, id)) callHome(game, id);
  if (game.posts[id] === (job ?? undefined)) return true;
  relieve(game, id);
  if (job === null) return true;
  const holders = game.household.filter((other) => game.posts[other] === job);
  if (holders.length >= JOB_PLACES[job]) relieve(game, holders[0]);
  game.posts[id] = job;
  return true;
};

/** What someone at a job is standing waiting for, if anything. */
export const needOf = (game: Game, id: string): Need | null => {
  const task = game.tasks[id];
  if (!task || (task.step !== null && task.step !== "return")) return null;
  if (task.job === "bake") return bakerWaitsFor(game, id, task);
  if (task.job === "garden") return null;
  // The measure is full: he waits to be told what it is spent on.
  if (task.job === "lab") return game.lab.ready && offered(game).length > 0 ? "choice" : null;
  return onShelf(game) < 1 && game.customers.some((c) => c.state === "waiting") ? "loaves" : null;
};

export const createGame = (plan: Plan = HOUSE, seed = 1): Game => {
  const world = createWorld(plan);
  for (const member of CAST) addActor(world, member.id, member.name, member.sprite, member.start);
  const beds = Object.fromEntries(CAST.map((c) => [c.id, c.bed]));
  const game: Game = { world, clock: START, beds, abed: {}, household: CAST.map((c) => c.id), coin: START_COIN, flour: START_FLOUR, recipes: ["bread"], shelf: { bread: START_LOAVES, pie: 0 }, deliveries: [], orders: 0, lab: newLab(), devices: [], outings: [], asks: [], scene: null, staged: null, cue: null, seen: [], goal: null, occasionDay: null, places: firstMap(), explored: {}, finds: {}, stock: { berries: 0, herbs: 0, ...(Object.fromEntries(CROP_IDS.map((id) => [id, 0])) as Record<CropId, number>) }, garden: newGarden(START), baked: {}, feats: [], posts: {}, tasks: {}, claims: {}, customers: [], sold: 0, lost: 0, today: { sold: 0, lost: 0 }, custom: FIRST_CUSTOM, rng: seed, seed, curios: [], wardrobe: newWardrobe(), shops: [], searches: {}, dials: {}, untilCustomer: CUSTOMER_EVERY, arrivals: 0, turns: {} };
  assign(game, "evelyn", "bake");
  assign(game, "rose", "shop");
  assign(game, "master", "lab");
  return game;
};

/**
 * Play one of the game's scenes now, whether or not it is due or has been played: for looking at
 * a scene without waiting for its day. It is begun as a scene that is due is, at the next moment
 * (staged, and on the page after the black), and like one it waits for its people to be home.
 */
export const playNow = (game: Game, id: string): boolean => {
  if (game.scene || !SCENES.some((s) => s.id === id)) return false;
  game.cue = id;
  return true;
};

/** The house wakes: nobody is abed, and the new day's trade begins (custom.ts). */
const wake = (game: Game): void => {
  game.abed = {};
  newMorning(game);
};

export const stepGame = (game: Game, dt: number): void => {
  // Someone out of doors is asking what she is to do: time stands still until she is told.
  if (game.asks.length > 0) return;
  // A scene is being played, or one is due: the clock and the house's own doings stand still, and only the people in it move.
  if (playScenes(game, dt)) return;
  if (asleep(game)) {
    if (passNight(game, dt)) wake(game);
    return;
  }
  // The night is passed as one when the whole house is in bed; if it was not, the morning still comes at waking.
  const waking = nextWake(game.clock);
  game.clock += dt * MINUTES_PER_SECOND;
  if (game.clock >= waking) wake(game);
  stepGarden(game);
  const night = isNight(game.clock);
  for (const id of game.household) {
    // Someone on an outing is about that and nothing else, by day or by night, until she is home.
    const outing = outingOf(game, id);
    if (outing) {
      stepOuting(game, outing, (who) => standDown(game, who));
      continue;
    }
    const actor = game.world.actors.find((a) => a.id === id);
    if (!actor) continue;
    const task = game.tasks[id];
    const post = game.posts[id];
    if (night) turnIn(game, actor);
    else if (task?.job === "bake") stepBaker(game, actor, task);
    else if (task?.job === "shop") stepKeeper(game, actor, task);
    else if (task?.job === "garden") stepGardener(game, actor, task);
    else if (task?.job === "lab") stepAlchemist(game, actor, task);
    else if (post) game.tasks[id] = newTask(post);
    else stepChores(game, actor);
  }
  stepCustomers(game, dt);
  stepDeliveries(game);
  stepLab(game, dt);
  stepWorld(game.world, dt);
};
