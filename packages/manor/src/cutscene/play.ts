import { addActor, addActorAt, giveOrders, isIdle, removeActor } from "../space";
import type { Actor, Order, World } from "../space";
import { HOLD } from "./types";
import type { Playing, Scene, Side, Step, Where } from "./types";

// Playing a scene: steps are taken one after another until one of them has to wait (for the
// player, for someone to arrive, for time to pass, for a called function to say it is done);
// when what it waits for has happened, the scene goes on. Everything here is headless: it
// moves the people of the world and keeps the line being spoken, and draws nothing.

/** More steps than this taken without a wait is a scene chasing its own tail: it is stopped. */
const RUNAWAY = 10_000;

/** Begin a scene. Nothing happens until it is stepped. */
export const play = (scene: Scene): Playing => ({ scene, frames: [{ steps: scene.steps, at: 0 }], waiting: null, line: null, sides: { left: null, right: null }, focus: null, vars: {}, done: false });

const actorOf = (world: World, who: string): Actor | undefined => world.actors.find((a) => a.id === who);

const pointOf = (world: World, where: Where): { x: number; z: number } | null => {
  if (typeof where !== "string") return where;
  // Someone's name, or a spot's.
  const actor = actorOf(world, where);
  if (actor) return { x: actor.walker.pos.x, z: actor.walker.pos.z };
  const spot = world.spots.get(where);
  return spot ? { x: spot.x, z: spot.z } : null;
};

/** The orders that take someone through each place in turn: across the floors to a spot, or straight over the ground to a point. */
const ordersTo = (to: Where[]): Order[] => to.map((where) => (typeof where === "string" ? { do: "go", spot: where } : { do: "path", points: [where] }));

/** The side a speaker's portrait stands at: her own, if she has one; where she stood before; else whichever is free, the left first; else the right. */
const sideFor = (playing: Playing, who: string): Side => {
  const own = playing.scene.cast[who]?.side;
  if (own) return own;
  if (playing.sides.left === who) return "left";
  if (playing.sides.right === who) return "right";
  return playing.sides.left === null ? "left" : "right";
};

const push = (playing: Playing, steps: Step[] | undefined): void => {
  if (steps && steps.length > 0) playing.frames.push({ steps, at: 0 });
};

/** Take one step. It may leave the scene waiting. */
const take = (playing: Playing, world: World, step: Step): void => {
  if (step.do === "say") {
    playing.line = { who: step.who, text: step.text };
    if (step.who !== null) playing.sides[sideFor(playing, step.who)] = step.who;
    playing.waiting = { for: "advance" };
  } else if (step.do === "enter") {
    const role = playing.scene.cast[step.who];
    const name = role?.name ?? step.who;
    const sprite = role?.sprite ?? step.who;
    if (actorOf(world, step.who)) return;
    if (typeof step.at === "string") addActor(world, step.who, name, sprite, step.at);
    else addActorAt(world, step.who, name, sprite, step.at);
  } else if (step.do === "leave") {
    removeActor(world, step.who);
    for (const side of ["left", "right"] as const) if (playing.sides[side] === step.who) playing.sides[side] = null;
  } else if (step.do === "walk") {
    if (actorOf(world, step.who)) giveOrders(world, step.who, ordersTo(step.to));
    if (step.wait) {
      playing.line = null;
      playing.waiting = { for: "arrive", who: [step.who] };
    }
  } else if (step.do === "arrive") {
    playing.line = null;
    playing.waiting = { for: "arrive", who: step.who };
  } else if (step.do === "face") {
    const toward = pointOf(world, step.toward);
    if (toward && actorOf(world, step.who)) giveOrders(world, step.who, [{ do: "face", ...toward }]);
  } else if (step.do === "wait") {
    playing.line = null;
    playing.waiting = { for: "time", left: step.seconds };
  } else if (step.do === "focus") {
    playing.focus = step.who;
  } else if (step.do === "choice") {
    playing.waiting = { for: "choice", options: step.options };
  } else {
    // A called function: it may hold the scene until it says to go on, or hand back steps to play.
    // It says to go on once: before it has returned (then the scene does not wait at all), or any time after.
    const go: { said: "not yet" | "before it returned" | "after"; early?: Step[] } = { said: "not yet" };
    const out = step.run({
      world,
      vars: playing.vars,
      resume: (then) => {
        if (go.said !== "not yet") return;
        if (playing.waiting?.for === "call") {
          go.said = "after";
          playing.waiting = null;
          push(playing, then);
        } else {
          go.said = "before it returned";
          go.early = then;
        }
      },
    });
    if (out !== HOLD) {
      go.said = "after";
      if (out) push(playing, out);
    } else if (go.said === "before it returned") push(playing, go.early);
    else {
      // Whatever it has opened has the screen: the last line does not linger under it.
      playing.line = null;
      playing.waiting = { for: "call" };
    }
  }
};

/** Whether what the scene waits for has happened, as far as the world and the clock can tell. The player's own answers come by `advance` and `choose`. */
const over = (playing: Playing, world: World, dt: number): boolean => {
  const { waiting } = playing;
  if (!waiting) return true;
  // Someone who is not on the scene is not waited for.
  if (waiting.for === "arrive") {
    return waiting.who.every((who) => {
      const actor = actorOf(world, who);
      return !actor || isIdle(actor);
    });
  }
  if (waiting.for === "time") {
    waiting.left -= dt;
    return waiting.left <= 0;
  }
  return false;
};

/** Move a scene on by a moment: wait out what it is waiting for, and take steps until it must wait again or is over. The world itself is stepped by whoever plays the scene. */
export const stepScene = (playing: Playing, world: World, dt: number): void => {
  if (playing.done) return;
  if (playing.waiting) {
    if (!over(playing, world, dt)) return;
    playing.waiting = null;
  }
  for (let taken = 0; !playing.waiting; taken++) {
    if (taken > RUNAWAY) throw new Error(`The scene "${playing.scene.id}" took ${RUNAWAY} steps without waiting for anything`);
    const frame = playing.frames[playing.frames.length - 1];
    if (!frame) {
      playing.done = true;
      playing.line = null;
      playing.focus = null;
      return;
    }
    if (frame.at >= frame.steps.length) playing.frames.pop();
    else take(playing, world, frame.steps[frame.at++]);
  }
};

/** The player moves the scene on from a line. False if it is not waiting for that. */
export const advance = (playing: Playing): boolean => {
  if (playing.waiting?.for !== "advance") return false;
  playing.waiting = null;
  return true;
};

/** The player answers. What the answer holds is played next. False if nothing is being asked, or there is no such answer. */
export const choose = (playing: Playing, n: number): boolean => {
  if (playing.waiting?.for !== "choice") return false;
  const option = playing.waiting.options[n];
  if (!option) return false;
  playing.vars.choice = option.id ?? n;
  playing.waiting = null;
  push(playing, option.then);
  return true;
};
