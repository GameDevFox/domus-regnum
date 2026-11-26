import { describe, expect, it } from "vitest";

import { advance, choose } from "../cutscene";
import { findWay, isIdle, outOfDoors, spotOf } from "../space";
import { asleep } from "./bedtime";
import { assign, playNow, stepGame } from "./game";
import { wantAll } from "./garden";
import { atMost } from "./outing-kit";
import { explore, send } from "./outing-send";
import { outingOf } from "./outing";
import { answer } from "./outing-tell";
import { MASTER_MARK, MASTER_WALK_METRES, SCENES, endScene, sceneDue } from "./scenes";
import { HZ, gameAt, person, run, until } from "./test-kit";
import { DAY, HOUR, SPOT } from "./tuning";
import type { Game } from "./types";

// A scene is staged: everyone not in it is put away, its people are put on their marks, and
// when it is over everyone is put back exactly as she was (staging.ts, scenes.ts).

/** The first morning a scene can be due on, a little before ten, with the first caller not yet seen. */
const beforeTen = (): Game => {
  const game = gameAt(DAY + 10 * HOUR - 2);
  game.seen = [];
  // A customer comes in at once, to be in the shop when the caller comes.
  game.untilCustomer = 0;
  return game;
};
/** Whatever the scene waits for from the player, give it: the next line, the first answer. Someone asking what next is told to come home. */
const answerAll = (game: Game): void => {
  const waiting = game.scene?.waiting?.for;
  if (game.scene && waiting === "advance") advance(game.scene);
  else if (game.scene && waiting === "choice") choose(game.scene, 0);
  if (game.asks.length > 0) answer(game, "home");
};
/** Play the scene that is playing (or that has been asked for, and begins at the next moment) through to its last step: it is over, and is ended at the next moment. */
const playOut = (game: Game, within = 300): void => {
  if (!game.scene) stepGame(game, 1 / HZ);
  for (let i = 0; i < within * HZ && game.scene && !game.scene.done; i++) {
    answerAll(game);
    stepGame(game, 1 / HZ);
  }
  if (!game.scene?.done) throw new Error("the scene never ended");
};
/** …and on, for it to be ended: the house goes on in the same moment. */
const playThrough = (game: Game, within = 300): void => {
  playOut(game, within);
  stepGame(game, 1 / HZ);
};
/** How everyone in the house stands: who, in order, where, walking what route, told what, carrying what. */
const howTheyStand = (game: Game) =>
  game.world.actors.map((a) => ({ id: a.id, pos: { ...a.walker.pos }, heading: a.walker.heading, route: a.walker.route, s: a.walker.s, orders: a.orders, next: a.next, carrying: a.carrying, busy: a.busy, label: a.label }));
const ids = (game: Game): string[] => game.world.actors.map((a) => a.id);

describe("a scene is staged", () => {
  it("puts away everyone who is not in it, the customers too, and puts the Master on his mark", () => {
    const game = beforeTen();
    until(game, () => sceneDue(game) !== null, 30);
    expect(game.customers.length).toBeGreaterThan(0);
    expect(ids(game).length).toBeGreaterThan(4);
    stepGame(game, 1 / HZ);
    // The priest is brought on at once, at the gate; of the house only the Master is there.
    expect(ids(game).sort()).toEqual(["master", "priest"]);
    const mark = spotOf(game.world, MASTER_MARK);
    // (Stood there, and a moment's walk from it.)
    const { pos } = person(game, "master").walker;
    expect([Math.hypot(pos.x - mark.x, pos.z - mark.z) < 0.05, pos.y]).toEqual([true, game.world.plan.storeys[mark.floor].y]);
    expect(person(game, "master").carrying).toBeNull();
  });

  it("gives the Master the same walk to the front door every time: a fixed number of metres from his mark", () => {
    const { world } = gameAt();
    const mark = spotOf(world, MASTER_MARK);
    const route = findWay(world.nav, world.doors, world.swings, { floor: mark.floor, x: mark.x, z: mark.z }, spotOf(world, SPOT.frontDoor));
    expect(route?.length).toBeCloseTo(MASTER_WALK_METRES, 1);
  });

  it("brings the Master to the door in the same time wherever he was: at work in the cellar, or out among the garden plots", () => {
    const times = ["lab", "garden"].map((job) => {
      const game = beforeTen();
      game.seen.push("first-caller");
      for (let plot = 0; plot < 4; plot++) wantAll(game, plot, "wheat");
      assign(game, "master", job === "lab" ? "lab" : "garden");
      if (job === "garden") until(game, () => outOfDoors(game.world, person(game, "master")), 300);
      expect(playNow(game, "first-caller")).toBe(true);
      stepGame(game, 1 / HZ);
      // From the moment the scene opens to the moment he is stood at the door.
      expect(isIdle(person(game, "master"))).toBe(false);
      let steps = 0;
      until(game, () => {
        steps++;
        return isIdle(person(game, "master"));
      }, 120);
      const door = spotOf(game.world, SPOT.frontDoor);
      expect(person(game, "master").walker.pos.x).toBeCloseTo(door.x, 1);
      expect(person(game, "master").walker.pos.z).toBeCloseTo(door.z, 1);
      return steps;
    });
    expect(times[1]).toBe(times[0]);
  });

  it("puts everyone back when it is over exactly as she stood, and she goes on with what she was at", () => {
    const game = beforeTen();
    until(game, () => sceneDue(game) !== null, 30);
    expect(game.customers.length).toBeGreaterThan(0);
    const stood = howTheyStand(game);
    const tasks = structuredClone(game.tasks);
    const { claims, abed } = game;
    const keep = { claims: { ...claims }, abed: { ...abed } };
    stepGame(game, 1 / HZ);
    expect(game.scene).not.toBeNull();
    playOut(game);
    // (As the next moment ends it: the house is put back, and then goes on.)
    endScene(game);
    expect(howTheyStand(game)).toEqual(stood);
    expect(game.tasks).toEqual(tasks);
    expect([game.claims, game.abed]).toEqual([keep.claims, keep.abed]);
    expect(game.staged).toBeNull();
    // …and the house goes on from there.
    const { clock } = game;
    run(game, 5);
    expect(game.clock).toBeGreaterThan(clock);
    expect(howTheyStand(game)).not.toEqual(stood);
  });

  it("puts everyone back the same if it is ended early, and whoever it brought on is gone", () => {
    const game = beforeTen();
    until(game, () => sceneDue(game) !== null, 30);
    const stood = howTheyStand(game);
    stepGame(game, 1 / HZ);
    run(game, 3);
    expect(ids(game)).toContain("priest");
    endScene(game);
    expect(game.scene).toBeNull();
    expect(howTheyStand(game)).toEqual(stood);
  });

  it("gets the Master up for it if it is played in the night, and puts him back to bed after with the rest", () => {
    const game = gameAt(22 * HOUR);
    until(game, () => asleep(game), 120);
    const abed = { ...game.abed };
    expect(playNow(game, "first-caller")).toBe(true);
    stepGame(game, 1 / HZ);
    expect(game.abed.master).toBeUndefined();
    playOut(game);
    endScene(game);
    expect(game.abed).toEqual(abed);
    expect(asleep(game)).toBe(true);
  });

  it("is staged the same way when the dev menu plays it: it is begun at the next moment, with the others put away", () => {
    const game = gameAt(11 * HOUR);
    expect(playNow(game, "first-caller")).toBe(true);
    expect(game.scene).toBeNull();
    stepGame(game, 1 / HZ);
    expect(game.scene?.scene.id).toBe("first-caller");
    expect(ids(game).sort()).toEqual(["master", "priest"]);
  });

  it("has every mark of every scene on the floor of the house, among the people of the household", () => {
    const game = gameAt();
    for (const entry of SCENES) {
      const { stage } = entry.scene(game);
      for (const [who, mark] of Object.entries(stage?.marks ?? {})) {
        expect(game.household).toContain(who);
        const spot = spotOf(game.world, mark);
        expect(game.world.nav.walkable(spot.floor, spot.x, spot.z)).toBe(true);
      }
    }
  });
});

describe("a scene and the outings", () => {
  // Found by a bug hunt, 2026-11-16: a scene begun while someone was coming up the drive wiped her walk, left her out of doors for good, and no night passed again.
  it("leaves someone coming up the drive to come on in when it is over, and the night passes as it should", () => {
    const game = gameAt(DAY + 8 * HOUR);
    game.seen = [];
    expect(send(game, "sage", { to: "town", doing: "buy", ware: "flour" }, atMost(30, true))).toBe(true);
    for (let i = 0; i < 6 * HOUR * HZ && outingOf(game, "sage")?.state !== "coming"; i++) {
      answerAll(game);
      stepGame(game, 1 / HZ);
    }
    expect(outingOf(game, "sage")?.state).toBe("coming");
    expect(playNow(game, "first-caller")).toBe(true);
    stepGame(game, 1 / HZ);
    expect(game.scene).not.toBeNull();
    expect(ids(game)).not.toContain("sage");
    playThrough(game);
    // She walks on up the drive, and in.
    for (let i = 0; i < 300 * HZ && outingOf(game, "sage"); i++) {
      answerAll(game);
      stepGame(game, 1 / HZ);
    }
    expect(outingOf(game, "sage")).toBeUndefined();
    expect(outOfDoors(game.world, person(game, "sage"))).toBe(false);
    // The house goes to bed, and the night passes.
    let slept = false;
    for (let i = 0; i < 30 * HOUR * HZ && game.clock < 2 * DAY + 7 * HOUR; i++) {
      answerAll(game);
      stepGame(game, 1 / HZ);
      slept ||= asleep(game);
    }
    expect(slept).toBe(true);
  });

  // …and the same with the Master himself on the drive: the scene waits until he is in, and then the nights pass as before.
  it("waits for the Master to come in from the drive, and the night passes after", () => {
    const game = gameAt(DAY + 8 * HOUR);
    expect(send(game, "master", { to: "town", doing: "buy", ware: "flour" }, atMost(30, true))).toBe(true);
    for (let i = 0; i < 6 * HOUR * HZ && outingOf(game, "master")?.state !== "coming"; i++) {
      answerAll(game);
      stepGame(game, 1 / HZ);
    }
    expect(playNow(game, "first-caller")).toBe(true);
    expect(outingOf(game, "master")?.state).toBe("coming");
    let whileOut = false;
    for (let i = 0; i < 300 * HZ && !game.scene; i++) {
      answerAll(game);
      stepGame(game, 1 / HZ);
      whileOut ||= game.scene !== null && outingOf(game, "master") !== undefined;
    }
    expect([game.scene?.scene.id, whileOut]).toEqual(["first-caller", false]);
    playThrough(game);
    let slept = false;
    for (let i = 0; i < 30 * HOUR * HZ && game.clock < 2 * DAY + 7 * HOUR; i++) {
      answerAll(game);
      stepGame(game, 1 / HZ);
      slept ||= asleep(game);
    }
    expect([slept, outOfDoors(game.world, person(game, "master"))]).toEqual([true, false]);
  });

  // Found by the same hunt: the first caller came while the Master was in the forest, and he spoke his lines from there.
  it("waits for the Master while he is out: the first caller comes once he is home", () => {
    const game = gameAt(DAY + 9 * HOUR);
    game.seen = [];
    expect(explore(game, "master", "forest", atMost(120, true))).toBe(true);
    let began = -1;
    let masterThen: { out: boolean; inHouse: boolean } | null = null;
    for (let i = 0; i < 12 * HOUR * HZ && began < 0; i++) {
      answerAll(game);
      stepGame(game, 1 / HZ);
      if (game.scene && began < 0) {
        began = game.clock;
        masterThen = { out: outingOf(game, "master") !== undefined, inHouse: game.world.actors.some((a) => a.id === "master") };
      }
    }
    expect(began).toBeGreaterThan(DAY + 10 * HOUR);
    expect(masterThen).toEqual({ out: false, inHouse: true });
  });

  it("is not begun from the dev menu while the Master is out either, but once he is home", () => {
    const game = gameAt(10 * HOUR);
    expect(explore(game, "master", "forest", atMost(60, true))).toBe(true);
    run(game, 1);
    expect(playNow(game, "first-caller")).toBe(true);
    run(game, 5);
    expect(game.scene).toBeNull();
    for (let i = 0; i < 6 * HOUR * HZ && !game.scene; i++) {
      answerAll(game);
      stepGame(game, 1 / HZ);
    }
    expect(game.scene?.scene.id).toBe("first-caller");
    expect(outingOf(game, "master")).toBeUndefined();
  });

  // Found by a review, 2026-11-16: begun while someone was asking, the scene never moved (the clock stands still for her), and it shut the map where she is answered.
  it("is not begun while someone is asking what she is to do, but once she is answered", () => {
    const game = gameAt(10 * HOUR);
    expect(explore(game, "sage", "forest", atMost(30, true))).toBe(true);
    until(game, () => game.asks.length > 0, 6 * HOUR);
    expect(playNow(game, "first-caller")).toBe(true);
    expect(sceneDue(game)).toBeNull();
    run(game, 5);
    expect(game.scene).toBeNull();
    expect(answer(game, "home")).toBe(true);
    stepGame(game, 1 / HZ);
    expect(game.scene?.scene.id).toBe("first-caller");
  });
});

describe("a scene and what the household was at", () => {
  // Found by the same hunt: a gardener out among the plots was given a walk to the front door that was dropped, and the scene played without her.
  it("brings the Master from among the garden plots to his mark, and walks him to the door", () => {
    const game = gameAt(9 * HOUR);
    for (let plot = 0; plot < 4; plot++) wantAll(game, plot, "wheat");
    assign(game, "master", "garden");
    until(game, () => outOfDoors(game.world, person(game, "master")) && person(game, "master").busy > 0, 300);
    const task = structuredClone(game.tasks.master);
    expect(playNow(game, "first-caller")).toBe(true);
    until(game, () => game.scene?.line != null, 120);
    const door = spotOf(game.world, SPOT.frontDoor);
    expect(Math.hypot(person(game, "master").walker.pos.x - door.x, person(game, "master").walker.pos.z - door.z)).toBeLessThan(0.1);
    playThrough(game);
    // …and he is back among his plots, at the same work.
    expect(outOfDoors(game.world, person(game, "master"))).toBe(true);
    expect(game.tasks.master).toEqual(task);
  });

  // Found by the same hunt: loaves in a baker's arms as a scene began were shelved, and counted to her mastery, wherever the scene left her.
  it("gives a baker back the loaves she was carrying, and they are shelved only when she has carried them to the shelf", () => {
    const game = gameAt(10 * HOUR);
    assign(game, "evelyn", null);
    assign(game, "master", "bake");
    until(game, () => {
      const task = game.tasks.master;
      return task?.job === "bake" && task.has === "bread" && task.step === "deliver" && !isIdle(person(game, "master"));
    }, 600);
    const { bread } = game.shelf;
    const baked = game.baked.master ?? 0;
    expect(playNow(game, "first-caller")).toBe(true);
    playThrough(game);
    expect([game.shelf.bread, game.baked.master ?? 0]).toEqual([bread, baked]);
    expect(person(game, "master").carrying).toBe("bread");
    until(game, () => (game.baked.master ?? 0) > baked, 60);
    const shelf = spotOf(game.world, SPOT.stock);
    expect(Math.hypot(person(game, "master").walker.pos.x - shelf.x, person(game, "master").walker.pos.z - shelf.z)).toBeLessThan(0.1);
  });
});
