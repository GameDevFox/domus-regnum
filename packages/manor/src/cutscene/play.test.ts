import { describe, expect, it } from "vitest";

import { HOUSE, addActor, createWorld, stepWorld } from "../space";
import type { World } from "../space";
import { advance, choose, play, stepScene } from "./play";
import { arrive, call, choice, enter, face, focus, leave, say, start, tell, wait, walk } from "./steps";
import { HOLD } from "./types";
import type { Playing, Scene, Step } from "./types";

// Playing a scene, with no screen: what is said and when, who walks where, and what the scene
// waits for.

const HZ = 60;
const CAST = { evelyn: { name: "Evelyn", portrait: "evelyn" }, guest: { name: "A guest", portrait: "guest", sprite: "townsman" }, master: { name: "The Master", portrait: "master" } };
const scene = (...steps: Step[]): Scene => ({ id: "test", cast: CAST, steps });
/** The house with Evelyn standing in the kitchen and the Master in the hall. */
const house = (): World => {
  const world = createWorld(HOUSE);
  addActor(world, "evelyn", "Evelyn", "evelyn", "kitchen.table.n");
  addActor(world, "master", "The Master", "master", "hall.door");
  return world;
};
/** Run the scene and the world together, as the game does. */
const run = (playing: Playing, world: World, seconds: number): void => {
  for (let i = 0; i < seconds * HZ; i++) {
    stepScene(playing, world, 1 / HZ);
    stepWorld(world, 1 / HZ);
  }
};
const until = (playing: Playing, world: World, so: () => boolean, within = 120): void => {
  for (let i = 0; i < within * HZ; i++) {
    if (so()) return;
    stepScene(playing, world, 1 / HZ);
    stepWorld(world, 1 / HZ);
  }
  throw new Error("it never happened");
};
const at = (world: World, who: string): { x: number; z: number } => {
  const actor = world.actors.find((a) => a.id === who);
  if (!actor) throw new Error(`nobody called ${who}`);
  return { x: actor.walker.pos.x, z: actor.walker.pos.z };
};

describe("lines", () => {
  it("are spoken one at a time, each waiting to be moved on, and the scene is over after the last", () => {
    const world = house();
    const playing = play(scene(say("evelyn", "Good morning."), say("master", "Is it?"), tell("It was.")));
    expect(playing.line).toBeNull();
    run(playing, world, 1);
    expect(playing.line).toEqual({ who: "evelyn", text: "Good morning." });
    expect(playing.waiting).toEqual({ for: "advance" });
    // It stays until it is moved on.
    run(playing, world, 5);
    expect(playing.line?.text).toBe("Good morning.");
    expect(advance(playing)).toBe(true);
    run(playing, world, 0.1);
    expect(playing.line).toEqual({ who: "master", text: "Is it?" });
    advance(playing);
    run(playing, world, 0.1);
    expect(playing.line).toEqual({ who: null, text: "It was." });
    expect(playing.done).toBe(false);
    advance(playing);
    run(playing, world, 0.1);
    expect(playing.done).toBe(true);
    expect(playing.line).toBeNull();
  });

  it("are not moved on when nothing is being said", () => {
    const playing = play(scene(wait(5)));
    run(playing, house(), 0.1);
    expect(advance(playing)).toBe(false);
    expect(choose(playing, 0)).toBe(false);
  });

  it("put the first speaker's portrait at the left and the next at the right, where each stays; a third takes the right", () => {
    const world = house();
    const playing = play(scene(say("evelyn", "One."), say("master", "Two."), say("evelyn", "Three."), say("guest", "Four."), tell("Five.")));
    const sides: string[] = [];
    for (let n = 0; n < 5; n++) {
      run(playing, world, 0.1);
      sides.push(`${playing.sides.left}/${playing.sides.right}`);
      advance(playing);
    }
    expect(sides).toEqual(["evelyn/null", "evelyn/master", "evelyn/master", "evelyn/guest", "evelyn/guest"]);
  });

  it("put a speaker who has a side of her own at it", () => {
    const world = house();
    const playing = play({ id: "sided", cast: { ...CAST, evelyn: { ...CAST.evelyn, side: "right" } }, steps: [say("evelyn", "From the right."), say("master", "From the left.")] });
    run(playing, world, 0.1);
    expect(playing.sides).toEqual({ left: null, right: "evelyn" });
    advance(playing);
    run(playing, world, 0.1);
    expect(playing.sides).toEqual({ left: "master", right: "evelyn" });
  });
});

describe("walking", () => {
  it("is across the floors of the house to a spot, and the scene waits until she is there", () => {
    const world = house();
    const playing = play(scene(say("evelyn", "I'll go."), walk("evelyn", "hall.door"), say("evelyn", "Here.")));
    run(playing, world, 0.1);
    advance(playing);
    run(playing, world, 1);
    // The line is gone while she walks, and nothing is said until she has arrived.
    expect(playing.line).toBeNull();
    expect(playing.waiting).toEqual({ for: "arrive", who: ["evelyn"] });
    until(playing, world, () => playing.line !== null);
    const door = world.spots.get("hall.door");
    expect(at(world, "evelyn").x).toBeCloseTo(door?.x ?? 0, 1);
    expect(at(world, "evelyn").z).toBeCloseTo(door?.z ?? 0, 1);
  });

  it("is straight over the ground to a point, out of doors as well as in: someone brought on at the gate walks up the drive", () => {
    const world = house();
    const gate = { x: 10, z: 21 };
    const playing = play(scene(enter("guest", gate), walk("guest", { x: 10, z: 13 }), tell("He is at the steps.")));
    stepScene(playing, world, 1 / HZ);
    expect(at(world, "guest")).toEqual(gate);
    expect(world.actors.find((a) => a.id === "guest")).toMatchObject({ name: "A guest", sprite: "townsman" });
    until(playing, world, () => playing.line !== null);
    expect(at(world, "guest").x).toBeCloseTo(10, 3);
    expect(at(world, "guest").z).toBeCloseTo(13, 3);
    // Eight metres at a walk: not at once, and not for ever.
    expect(world.t).toBeGreaterThan(4);
    expect(world.t).toBeLessThan(12);
  });

  it("goes through each place in turn, a point and then a spot: up the drive and in at the door", () => {
    const world = house();
    const playing = play(scene(enter("guest", { x: 10, z: 21 }), walk("guest", { x: 10, z: 12.6 }, "hall.door"), tell("In.")));
    until(playing, world, () => playing.line !== null);
    const door = world.spots.get("hall.door");
    expect(at(world, "guest").z).toBeCloseTo(door?.z ?? 0, 1);
  });

  it("can be begun without waiting, and waited for later: two walk at once", () => {
    const world = house();
    const playing = play(scene(start("evelyn", "hall.door"), start("master", "kitchen.table.s"), tell("Both are on their way."), arrive("evelyn", "master"), tell("Both are there.")));
    run(playing, world, 0.5);
    expect(playing.line?.text).toBe("Both are on their way.");
    const moved = [at(world, "evelyn"), at(world, "master")];
    run(playing, world, 1);
    expect(at(world, "evelyn")).not.toEqual(moved[0]);
    expect(at(world, "master")).not.toEqual(moved[1]);
    advance(playing);
    until(playing, world, () => playing.line?.text === "Both are there.");
    expect(world.actors.every((a) => a.orders.length === 0)).toBe(true);
  });

  it("does not wait for someone who is not on the scene", () => {
    const world = house();
    const playing = play(scene(walk("nobody", "hall.door"), tell("On we go.")));
    run(playing, world, 0.1);
    expect(playing.line?.text).toBe("On we go.");
  });
});

describe("coming on and going off", () => {
  it("brings someone on at a spot, and takes her off again, portrait and all", () => {
    const world = house();
    const playing = play(scene(enter("guest", "shop.door"), say("guest", "Good day."), leave("guest"), tell("He has gone.")));
    run(playing, world, 0.1);
    expect(world.actors.some((a) => a.id === "guest")).toBe(true);
    expect(playing.sides.left).toBe("guest");
    advance(playing);
    run(playing, world, 0.1);
    expect(world.actors.some((a) => a.id === "guest")).toBe(false);
    expect(playing.sides.left).toBeNull();
  });

  it("does not bring on someone who is there already", () => {
    const world = house();
    const playing = play(scene(enter("evelyn", "hall.door"), tell("Still one of her.")));
    run(playing, world, 0.1);
    expect(world.actors.filter((a) => a.id === "evelyn").length).toBe(1);
  });
});

describe("facing", () => {
  it("turns someone to face another", () => {
    const world = house();
    const playing = play(scene(face("master", "evelyn"), wait(3), tell("He has turned.")));
    until(playing, world, () => playing.line !== null);
    const him = world.actors.find((a) => a.id === "master");
    const toHer = Math.atan2(at(world, "evelyn").x - at(world, "master").x, at(world, "evelyn").z - at(world, "master").z);
    expect(Math.cos((him?.walker.heading ?? 0) - toHer)).toBeGreaterThan(0.99);
  });
});

describe("waiting, and where the scene looks", () => {
  it("waits so many seconds, and no more", () => {
    const world = house();
    const playing = play(scene(wait(2), tell("Now.")));
    run(playing, world, 1.9);
    expect(playing.line).toBeNull();
    run(playing, world, 0.2);
    expect(playing.line?.text).toBe("Now.");
  });

  it("looks at whoever it is told to, until it is over", () => {
    const world = house();
    const playing = play(scene(focus("master"), tell("Look at him."), focus("evelyn"), tell("And at her.")));
    run(playing, world, 0.1);
    expect(playing.focus).toBe("master");
    advance(playing);
    run(playing, world, 0.1);
    expect(playing.focus).toBe("evelyn");
    advance(playing);
    run(playing, world, 0.1);
    expect(playing.done).toBe(true);
    expect(playing.focus).toBeNull();
  });
});

describe("a choice", () => {
  const asking = (): Scene => scene(say("master", "Tea, or supper?"), choice({ text: "Tea", id: "tea", then: [say("evelyn", "Tea it is."), say("evelyn", "With cake.")] }, { text: "Supper", then: [say("evelyn", "Supper, then.")] }, { text: "Neither" }), tell("So it was settled."));

  it("waits for an answer, with the question still showing, and plays what the answer holds before going on", () => {
    const world = house();
    const playing = play(asking());
    run(playing, world, 0.1);
    advance(playing);
    run(playing, world, 1);
    expect(playing.waiting).toMatchObject({ for: "choice" });
    expect(playing.line?.text).toBe("Tea, or supper?");
    expect(advance(playing)).toBe(false);
    expect(choose(playing, 0)).toBe(true);
    const said: string[] = [];
    for (let n = 0; n < 3; n++) {
      run(playing, world, 0.1);
      said.push(playing.line?.text ?? "");
      advance(playing);
    }
    expect(said).toEqual(["Tea it is.", "With cake.", "So it was settled."]);
    expect(playing.vars.choice).toBe("tea");
  });

  it("remembers an answer with no name by its place, and goes straight on from one that holds nothing", () => {
    const world = house();
    const playing = play(asking());
    run(playing, world, 0.1);
    advance(playing);
    run(playing, world, 0.1);
    choose(playing, 2);
    run(playing, world, 0.1);
    expect(playing.line?.text).toBe("So it was settled.");
    expect(playing.vars.choice).toBe(2);
  });

  it("takes no answer that was not offered", () => {
    const world = house();
    const playing = play(asking());
    run(playing, world, 0.1);
    advance(playing);
    run(playing, world, 0.1);
    expect(choose(playing, 3)).toBe(false);
    expect(playing.waiting).toMatchObject({ for: "choice" });
  });
});

describe("a called function", () => {
  it("is run in its turn, and the scene goes on", () => {
    const world = house();
    const playing = play(scene(call(({ vars }) => void (vars.rang = true)), tell("The bell has rung.")));
    run(playing, world, 0.1);
    expect(playing.vars.rang).toBe(true);
    expect(playing.line?.text).toBe("The bell has rung.");
  });

  it("can hand back steps, which are played next: a branch decided as the scene runs", () => {
    const world = house();
    const playing = play(scene(call(({ world: w }) => (w.actors.length > 1 ? [tell("There is company.")] : [tell("Alone.")])), tell("After.")));
    run(playing, world, 0.1);
    expect(playing.line?.text).toBe("There is company.");
    advance(playing);
    run(playing, world, 0.1);
    expect(playing.line?.text).toBe("After.");
  });

  it("can hold the scene until it says to go on: a menu to be shut, a game to be played out", () => {
    const world = house();
    let done: ((then?: Step[]) => void) | null = null;
    const playing = play(scene(call(({ resume }) => ((done = resume), HOLD)), tell("Back from the game.")));
    run(playing, world, 3);
    expect(playing.waiting).toEqual({ for: "call" });
    expect(playing.line).toBeNull();
    (done as unknown as (then?: Step[]) => void)([tell("You won.")]);
    run(playing, world, 0.1);
    expect(playing.line?.text).toBe("You won.");
    advance(playing);
    run(playing, world, 0.1);
    expect(playing.line?.text).toBe("Back from the game.");
    // Said twice, it goes on once.
    (done as unknown as (then?: Step[]) => void)([tell("Again?")]);
    advance(playing);
    run(playing, world, 0.1);
    expect(playing.done).toBe(true);
  });

  it("that says to go on before it has even returned does not hold the scene at all", () => {
    const world = house();
    const playing = play(scene(call(({ resume }) => (resume([tell("Already done.")]), HOLD)), tell("After.")));
    run(playing, world, 0.1);
    expect(playing.line?.text).toBe("Already done.");
    advance(playing);
    run(playing, world, 0.1);
    expect(playing.line?.text).toBe("After.");
  });

  it("says to go on for itself only: one that is done with cannot let go a later one that is holding the scene", () => {
    type Resume = (then?: Step[]) => void;
    const world = house();
    const kept: Resume[] = [];
    const keep = (resume: Resume): void => void kept.push(resume);
    // The first hands back its steps; the second holds and is let go; the third holds, and is not to be let go by either of them.
    const playing = play(scene(call(({ resume }) => (keep(resume), [tell("From the first.")])), call(({ resume }) => (keep(resume), HOLD)), call(() => HOLD), tell("After.")));
    run(playing, world, 0.1);
    advance(playing);
    run(playing, world, 0.1);
    expect(playing.waiting).toEqual({ for: "call" });
    kept[1]();
    run(playing, world, 0.1);
    expect(playing.waiting).toEqual({ for: "call" });
    kept[0]([tell("From the first, too late.")]);
    kept[1]([tell("From the second, a second time.")]);
    run(playing, world, 0.1);
    expect(playing.waiting).toEqual({ for: "call" });
    expect(playing.line).toBeNull();
  });

  it("is stopped if the scene chases its own tail", () => {
    const world = house();
    const forever: Step = call(() => [forever]);
    const playing = play(scene(forever));
    expect(() => run(playing, world, 0.1)).toThrow(/without waiting/);
  });
});
