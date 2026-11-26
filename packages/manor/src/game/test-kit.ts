import { floorOf, outOfDoors, spotOf, standingAt } from "../space";
import type { Actor } from "../space";
import { assign, createGame, stepGame } from "./game";
import { APPROACHES, GARDEN_WAY } from "./grounds";
import { outingOf } from "./outing";
import { answer } from "./outing-tell";
import { SCENES } from "./scenes";
import { HOUR, SHOP_OPENS } from "./tuning";
import { SHOP_IDS } from "./wares";
import type { Customer, Game } from "./types";

// What the game's tests share: a game put to a time of day, and ways to run it.

/** How far off the line of her way a visitor out of doors may be, in metres: she keeps to her right of it, and cuts a corner a little. On the gravel, still. */
const ON_THE_WAY = 0.5;

type Point = { x: number; z: number };
/** How far a point is from the nearest point of a line from one point to another. */
const offLine = (p: Point, a: Point, b: Point): number => {
  const along = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z)) / ((b.x - a.x) ** 2 + (b.z - a.z) ** 2 || 1)));
  return Math.hypot(p.x - (a.x + (b.x - a.x) * along), p.z - (a.z + (b.z - a.z) * along));
};

/** Whether a point out of doors is on one of the ways visitors come and go by: from the edge of the property to a door. */
export const onAWay = (game: Game, at: Point): boolean =>
  Object.values(APPROACHES).some((approach) => {
    const line = [...approach.way, spotOf(game.world, approach.door)];
    return line.slice(1).some((to, n) => offLine(at, line[n], to) <= ON_THE_WAY);
  });

/** Whether a point out of doors is on the gardener's way: from the back door's step, up the path and along the aisle between the plots. */
export const inTheGarden = (at: Point): boolean => GARDEN_WAY.slice(1).some((to, n) => offLine(at, GARDEN_WAY[n], to) <= ON_THE_WAY);

/**
 * Whether someone is where she may be: on the floor of the house; or, out of doors, a visitor on
 * one of the ways to a door, the gardener among her plots, or someone on the drive going out to
 * a place on the map or coming home. Nobody else of the household is ever seen out of doors.
 */
export const whereSheMayBe = (game: Game, actor: Actor): boolean => {
  const floor = floorOf(game.world, actor);
  const at = standingAt(game.world, actor);
  // (Between storeys she is on a stair, which is somewhere she may be.)
  if (!floor) return true;
  // (One of the household is out of doors only as the gardener, among the plots, or on the drive, going out to a place on the map or coming home from one.)
  if (outOfDoors(game.world, actor) && game.household.includes(actor.id)) return (game.tasks[actor.id]?.job === "garden" && inTheGarden(at)) || (game.outings.some((o) => o.who === actor.id) && onAWay(game, at));
  if (outOfDoors(game.world, actor)) return onAWay(game, at);
  return game.world.nav.fits(floor, at.x, at.z);
};

/** The customers who have a place at the counter: in at the door and not yet on the way out. */
export const atCounter = (game: Game): Customer[] => game.customers.filter((c) => c.place !== null && c.state !== "leaving");

export const HZ = 60;

/** A game with the clock put to a time of the first day: the shop's opening, unless another is given. */
export const gameAt = (minute: number = SHOP_OPENS, seed?: number): Game => {
  const game = createGame(undefined, seed);
  game.clock = minute;
  // The house's rules are tested without its scenes breaking in on them: scenes have tests of their own (scenes.test.ts).
  game.seen.push(...SCENES.map((s) => s.id));
  // …and with the town's shops found, as they were from the first until 2026-11-16: an errand into town is the plainest outing there is, and
  // much is tested by one. The finding of the shops has tests of its own (shops.test.ts), which begin by forgetting them.
  game.shops.push(...SHOP_IDS);
  return game;
};

export const run = (game: Game, seconds: number, each?: () => void): void => {
  for (let i = 0; i < seconds * HZ; i++) {
    stepGame(game, 1 / HZ);
    each?.();
  }
};

/** Run until something is so, or fail if it has not happened in time. */
export const until = (game: Game, so: () => boolean, withinSeconds = 120): void => {
  for (let i = 0; i < withinSeconds * HZ; i++) {
    if (so()) return;
    stepGame(game, 1 / HZ);
  }
  throw new Error("it never happened");
};

/** Run until someone who is out is home again: told to come home whenever she asks what she is to do. Fails if she is not home in time. */
export const comeHome = (game: Game, id: string, withinSeconds = 120): void => {
  for (let i = 0; i < withinSeconds * HZ; i++) {
    if (!game.outings.some((outing) => outing.who === id)) return;
    if (game.asks[0]?.who === id) answer(game, "home");
    stepGame(game, 1 / HZ);
  }
  throw new Error("she never came home");
};

export const person = (game: Game, id: string) => {
  const actor = game.world.actors.find((a) => a.id === id);
  if (!actor) throw new Error(`nobody called ${id}`);
  return actor;
};

/** The ground-floor room someone is in, if she is in one. */
export const roomOf = (game: Game, id: string): string | undefined => {
  const { pos } = person(game, id).walker;
  return game.world.plan.rooms.find((r) => r.floor === "ground" && pos.x >= r.rect.x && pos.x <= r.rect.x + r.rect.w && pos.z >= r.rect.z && pos.z <= r.rect.z + r.rect.d)?.id;
};

export const NINE = 9 * HOUR;
/** Nine in the morning, and nobody baking, so that nothing in the house changes but who is in it. */
export const quiet = (): Game => {
  const game = gameAt(NINE);
  assign(game, "evelyn", null);
  return game;
};
/** In the house: under its roof, and not still on the drive on her way out or coming home. */
export const inHouse = (game: Game, id: string): boolean => game.world.actors.some((a) => a.id === id && !outOfDoors(game.world, a)) && outingOf(game, id)?.state !== "coming";
export const home = (game: Game, id: string, within: number): void => until(game, () => outingOf(game, id) === undefined, within);
